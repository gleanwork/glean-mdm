// Package hosts configures MCP server entries into each supported client's
// config file, mirroring src/hosts/index.ts.
package hosts

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gleanwork/glean-mdm/internal/config"
	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/platform"
	"github.com/gleanwork/glean-mdm/internal/registry"
)

// Options controls a single user's host configuration pass.
type Options struct {
	Servers     []config.McpServerEntry
	DryRun      bool
	UID         *int
	GID         *int
	UserHomeDir string
	Username    string
}

// Result reports the outcome for one host.
type Result struct {
	Host    string
	Success bool
	Error   string
}

func expandConfigPath(configPath, userHomeDir string) string {
	s := strings.ReplaceAll(configPath, "$HOME", userHomeDir)
	s = strings.ReplaceAll(s, "%USERPROFILE%", userHomeDir)
	s = strings.ReplaceAll(s, "%APPDATA%", userHomeDir+`\AppData\Roaming`)
	return s
}

func chownAncestors(filePath, stopAt string, uid, gid int) {
	stopDir := filepath.Clean(stopAt)
	dir := filepath.Dir(filepath.Clean(filePath))
	for len(dir) > len(stopDir) && strings.HasPrefix(dir, stopDir) {
		_ = os.Chown(dir, uid, gid)
		dir = filepath.Dir(dir)
	}
}

func isSymlink(path string) bool {
	info, err := os.Lstat(path)
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeSymlink != 0
}

// ResolveProfileOwner reads the Windows profile owner (NTAccount) for a home
// directory. Returns "" if it cannot be determined.
func ResolveProfileOwner(homeDir string) string {
	escaped := strings.ReplaceAll(homeDir, "'", "''")
	script := fmt.Sprintf(`[Console]::OutputEncoding = [Text.Encoding]::UTF8; $p = Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -eq '%s' } | Select-Object -First 1; if ($p) { ([System.Security.Principal.SecurityIdentifier]::new($p.SID)).Translate([System.Security.Principal.NTAccount]).Value }`, escaped)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// SetOwnerWindowsBatch sets ownership of the given paths to owner in one
// PowerShell invocation.
func SetOwnerWindowsBatch(paths []string, owner string) {
	if len(paths) == 0 {
		return
	}
	escapedOwner := strings.ReplaceAll(owner, "'", "''")
	quoted := make([]string, len(paths))
	for i, p := range paths {
		quoted[i] = "'" + strings.ReplaceAll(p, "'", "''") + "'"
	}
	pathsList := strings.Join(quoted, ",")
	script := fmt.Sprintf(`[Console]::OutputEncoding = [Text.Encoding]::UTF8; $o = [System.Security.Principal.NTAccount]'%s'; $paths = @(%s); $i = 0; $paths | ForEach-Object { $p = $_; $i++; try { $a = Get-Acl -LiteralPath $p -ErrorAction Stop; $a.SetOwner($o); Set-Acl -LiteralPath $p -AclObject $a -ErrorAction Stop; Write-Output "[$i/$($paths.Count)] OK: $p" } catch { Write-Warning "[$i/$($paths.Count)] Failed: $p : $_" } }`, escapedOwner, pathsList)

	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	timeout := time.Duration(max(60_000, len(paths)*15_000)) * time.Millisecond
	done := make(chan error, 1)
	if err := cmd.Start(); err != nil {
		logger.Warn("Failed to batch-set ownership to %s: %v", owner, err)
		return
	}
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil {
			logger.Warn("Failed to batch-set ownership to %s: %v", owner, err)
		}
	case <-time.After(timeout):
		_ = cmd.Process.Kill()
		logger.Warn("Failed to batch-set ownership to %s: timed out", owner)
	}
}

// deepMergeServerConfigs merges source into target one level deep (object values
// of shared keys are shallow-merged), matching the original helper.
func deepMergeServerConfigs(target, source map[string]any) map[string]any {
	result := make(map[string]any, len(target))
	for k, v := range target {
		result[k] = v
	}
	for key, value := range source {
		valueObj, valueIsObj := asObject(value)
		resultObj, resultIsObj := asObject(result[key])
		if valueIsObj && resultIsObj {
			merged := make(map[string]any, len(resultObj)+len(valueObj))
			for k, v := range resultObj {
				merged[k] = v
			}
			for k, v := range valueObj {
				merged[k] = v
			}
			result[key] = merged
		} else {
			result[key] = value
		}
	}
	return result
}

// Configure writes the Glean MCP server entries into every supported host's
// config file for a single user.
func Configure(opts Options) []Result {
	currentPlatform := platform.Get()
	clients := registry.Clients()
	results := make([]Result, 0, len(clients))

	var windowsOwner string
	if currentPlatform == platform.Win32 {
		windowsOwner = ResolveProfileOwner(opts.UserHomeDir)
		if windowsOwner == "" {
			windowsOwner = opts.Username
		}
	}
	var windowsOwnerPaths []string

	for _, client := range clients {
		configPath, ok := client.ConfigPathFor(currentPlatform)
		if !ok {
			continue
		}

		resolvedPath := expandConfigPath(configPath, opts.UserHomeDir)

		if opts.DryRun {
			logger.Info("[DRY RUN] Would configure %s at %s", client.DisplayName, resolvedPath)
			results = append(results, Result{Host: client.DisplayName, Success: true})
			continue
		}

		if err := configureOne(client, opts.Servers, resolvedPath); err != nil {
			logger.Error("Failed to configure %s: %v", client.DisplayName, err)
			results = append(results, Result{Host: client.DisplayName, Success: false, Error: err.Error()})
			continue
		}

		if currentPlatform == platform.Win32 && windowsOwner != "" {
			if !isSymlink(resolvedPath) {
				windowsOwnerPaths = append(windowsOwnerPaths, resolvedPath)
			}
			stopDir := filepath.Clean(opts.UserHomeDir)
			dir := filepath.Dir(filepath.Clean(resolvedPath))
			for len(dir) > len(stopDir) && strings.HasPrefix(dir, stopDir) {
				windowsOwnerPaths = append(windowsOwnerPaths, dir)
				dir = filepath.Dir(dir)
			}
		} else if opts.UID != nil && opts.GID != nil {
			if !isSymlink(resolvedPath) {
				_ = os.Chown(resolvedPath, *opts.UID, *opts.GID)
			}
			chownAncestors(resolvedPath, opts.UserHomeDir, *opts.UID, *opts.GID)
		}

		results = append(results, Result{Host: client.DisplayName, Success: true})
	}

	if windowsOwner != "" && len(windowsOwnerPaths) > 0 {
		SetOwnerWindowsBatch(dedupe(windowsOwnerPaths), windowsOwner)
	}

	return results
}

func configureOne(client *registry.Client, servers []config.McpServerEntry, resolvedPath string) error {
	mergedConfig := map[string]any{}
	for _, server := range servers {
		entry := client.BuildEntry(server.ServerName, config.GetServerURL(server))
		name := registry.NormalizeServerName(server.ServerName)
		generated := map[string]any{
			client.ServersPropertyName: map[string]any{name: entry},
		}
		mergedConfig = deepMergeServerConfigs(mergedConfig, generated)
	}

	if err := os.MkdirAll(filepath.Dir(resolvedPath), 0o755); err != nil {
		return err
	}

	switch client.ConfigFormat {
	case "json":
		return configureJSONFile(mergedConfig, resolvedPath)
	case "toml":
		return configureTOMLFile(mergedConfig, resolvedPath)
	case "yaml":
		return configureYAMLFile(mergedConfig, resolvedPath)
	default:
		return fmt.Errorf("Unsupported config format: %s", client.ConfigFormat)
	}
}

func dedupe(paths []string) []string {
	seen := make(map[string]struct{}, len(paths))
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}
