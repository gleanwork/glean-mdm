// Package extensions installs the Glean editor extension across supported AI
// editors (Cursor, Windsurf, Antigravity), mirroring extensions/index.ts.
package extensions

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/platform"
)

const (
	extensionID      = "glean.glean"
	installTimeoutMS = 120_000
)

// Options configures an extension install pass for a single user.
type Options struct {
	DryRun      bool
	UID         *int
	GID         *int
	UserHomeDir string
	Username    string
}

// Result reports the outcome for one editor.
type Result struct {
	Editor  string
	Error   string
	Skipped bool
	Success bool
}

type editorDefinition struct {
	id                string
	extensionsDirName string
	cliPaths          map[platform.Platform][]string
}

func editorDefinitions(userHomeDir string) []editorDefinition {
	return []editorDefinition{
		{
			id:                "cursor",
			extensionsDirName: ".cursor",
			cliPaths: map[platform.Platform][]string{
				platform.Darwin: {"/usr/local/bin/cursor", "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"},
				platform.Linux:  {"/usr/local/bin/cursor", "/usr/bin/cursor", "/opt/Cursor/resources/app/bin/cursor"},
				platform.Win32: {
					`C:\Program Files\Cursor\resources\app\bin\cursor.cmd`,
					filepath.Join(userHomeDir, "AppData", "Local", "Programs", "cursor", "resources", "app", "bin", "cursor.cmd"),
				},
			},
		},
		{
			id:                "windsurf",
			extensionsDirName: ".windsurf",
			cliPaths: map[platform.Platform][]string{
				platform.Darwin: {"/usr/local/bin/windsurf", "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf"},
				platform.Linux:  {"/usr/local/bin/windsurf", "/usr/bin/windsurf", "/opt/Windsurf/resources/app/bin/windsurf"},
				platform.Win32: {
					`C:\Program Files\Windsurf\resources\app\bin\windsurf.cmd`,
					filepath.Join(userHomeDir, "AppData", "Local", "Programs", "windsurf", "resources", "app", "bin", "windsurf.cmd"),
				},
			},
		},
		{
			id:                "antigravity",
			extensionsDirName: ".antigravity",
			cliPaths: map[platform.Platform][]string{
				platform.Darwin: {"/usr/local/bin/antigravity", "/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"},
				platform.Linux:  {"/usr/local/bin/antigravity", "/usr/bin/antigravity", "/opt/Antigravity/resources/app/bin/antigravity"},
				platform.Win32: {
					`C:\Program Files\Antigravity\resources\app\bin\antigravity.cmd`,
					filepath.Join(userHomeDir, "AppData", "Local", "Programs", "antigravity", "resources", "app", "bin", "antigravity.cmd"),
				},
			},
		},
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// FindEditorCli locates an editor's CLI from candidate paths, falling back to
// the system PATH.
func FindEditorCli(editorID string, candidates []string, p platform.Platform) string {
	for _, candidate := range candidates {
		if fileExists(candidate) {
			return candidate
		}
	}

	lookupCmd := "which"
	if p == platform.Win32 {
		lookupCmd = "where"
	}
	out, err := exec.Command(lookupCmd, editorID).Output()
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 {
		return ""
	}
	found := strings.TrimSpace(lines[0])
	if found != "" && fileExists(found) {
		return found
	}
	return ""
}

// FindOldExtensionDirs returns versioned Glean extension directories under
// extensionsDir.
func FindOldExtensionDirs(extensionsDir string) []string {
	entries, err := os.ReadDir(extensionsDir)
	if err != nil {
		return nil
	}
	var dirs []string
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "glean.glean-") {
			dirs = append(dirs, filepath.Join(extensionsDir, entry.Name()))
		}
	}
	return dirs
}

// RemoveExtensionDirs removes the given extension directories.
func RemoveExtensionDirs(dirs []string) {
	for _, dir := range dirs {
		if err := os.RemoveAll(dir); err != nil {
			logger.Warn("Failed to remove old extension %s: %v", dir, err)
			continue
		}
		logger.Info("Removed old extension: %s", dir)
	}
}

func runInstallExtension(cliPath, username, extensionsDir string, p platform.Platform) error {
	var cmd *exec.Cmd
	if p == platform.Win32 {
		cmd = exec.Command(cliPath, "--install-extension", extensionID, "--extensions-dir", extensionsDir)
	} else {
		cmd = exec.Command("sudo", "-H", "-u", username, cliPath, "--install-extension", extensionID)
	}
	return runWithTimeout(cmd, installTimeoutMS*time.Millisecond)
}

func runWithTimeout(cmd *exec.Cmd, timeout time.Duration) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(timeout):
		_ = cmd.Process.Kill()
		<-done
		return os.ErrDeadlineExceeded
	}
}

// Install installs the Glean extension for every supported editor found.
func Install(opts Options) []Result {
	p := platform.Get()
	editors := editorDefinitions(opts.UserHomeDir)
	results := make([]Result, 0, len(editors))

	for _, editor := range editors {
		candidates := editor.cliPaths[p]
		cliPath := FindEditorCli(editor.id, candidates, p)

		if cliPath == "" {
			logger.Info("%s: CLI not found, skipping extension install", editor.id)
			results = append(results, Result{Editor: editor.id, Success: true, Skipped: true})
			continue
		}

		if opts.DryRun {
			logger.Info("[DRY RUN] Would install extension for %s via %s", editor.id, cliPath)
			results = append(results, Result{Editor: editor.id, Success: true})
			continue
		}

		extensionsDir := filepath.Join(opts.UserHomeDir, editor.extensionsDirName, "extensions")
		oldDirs := map[string]bool{}
		for _, d := range FindOldExtensionDirs(extensionsDir) {
			oldDirs[d] = true
		}

		if err := runInstallExtension(cliPath, opts.Username, extensionsDir, p); err != nil {
			logger.Error("Failed to install extension for %s: %v", editor.id, err)
			results = append(results, Result{Editor: editor.id, Success: false, Error: err.Error()})
			continue
		}

		currentDirs := map[string]bool{}
		for _, d := range FindOldExtensionDirs(extensionsDir) {
			currentDirs[d] = true
		}
		// Only prune stale versions if a new version dir actually appeared.
		var newDirs []string
		for d := range currentDirs {
			if !oldDirs[d] {
				newDirs = append(newDirs, d)
			}
		}
		if len(newDirs) > 0 {
			var staleDirs []string
			for d := range oldDirs {
				if currentDirs[d] {
					staleDirs = append(staleDirs, d)
				}
			}
			RemoveExtensionDirs(staleDirs)
		}

		logger.Info("Installed extension for %s via %s", editor.id, cliPath)
		results = append(results, Result{Editor: editor.id, Success: true})
	}

	return results
}
