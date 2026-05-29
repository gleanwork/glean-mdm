// Package updater self-updates the installed binary, mirroring updater.ts.
package updater

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/platform"
	"github.com/gleanwork/glean-mdm/internal/version"
)

type versionInfo struct {
	Version   string            `json:"version"`
	Checksums map[string]string `json:"checksums"`
}

// CompareVersions compares dotted version strings (ignoring a leading "v").
// Returns negative, zero, or positive.
func CompareVersions(a, b string) int {
	partsA := splitVersion(a)
	partsB := splitVersion(b)
	n := len(partsA)
	if len(partsB) > n {
		n = len(partsB)
	}
	for i := 0; i < n; i++ {
		var va, vb int
		if i < len(partsA) {
			va = partsA[i]
		}
		if i < len(partsB) {
			vb = partsB[i]
		}
		if diff := va - vb; diff != 0 {
			return diff
		}
	}
	return 0
}

func splitVersion(v string) []int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.Split(v, ".")
	out := make([]int, len(parts))
	for i, p := range parts {
		n, _ := strconv.Atoi(p)
		out[i] = n
	}
	return out
}

// ShouldUpdate reports whether the current version differs from the target
// (pinned version takes precedence over the server version).
func ShouldUpdate(currentVersion, serverVersion, pinnedVersion string) bool {
	target := serverVersion
	if pinnedVersion != "" {
		target = pinnedVersion
	}
	return CompareVersions(currentVersion, target) != 0
}

func getBinaryURL(binaryURLPrefix, target, ver string) string {
	ext := ""
	if strings.HasPrefix(target, "windows-") {
		ext = ".exe"
	}
	return fmt.Sprintf("%s/%s/glean-mdm-%s%s", binaryURLPrefix, ver, target, ext)
}

// CheckForUpdate checks for and applies a binary update. It re-executes the new
// binary and exits on success; otherwise it returns false.
func CheckForUpdate(versionURL, binaryURLPrefix, pinnedVersion string) bool {
	target := platform.GetTargetName()
	currentPlatform := platform.Get()

	logger.Info("Checking for updates (current: %s)", version.BuildVersion)

	var targetVersion string
	var expectedChecksum string

	if pinnedVersion != "" {
		if CompareVersions(version.BuildVersion, pinnedVersion) == 0 {
			logger.Info("Already at pinned version (%s)", version.BuildVersion)
			return false
		}
		targetVersion = pinnedVersion
	} else {
		logger.Info("Fetching version info from %s", versionURL)
		resp, err := http.Get(versionURL)
		if err != nil {
			logger.Warn("Update check failed: %v", err)
			logger.Warn("Continuing with current version: %s", version.BuildVersion)
			return false
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, berr := io.ReadAll(resp.Body)
			resp.Body.Close()
			bodyStr := "<no body>"
			if berr == nil && len(body) > 0 {
				bodyStr = string(body)
			}
			logger.Warn("Update check returned HTTP %d: %s", resp.StatusCode, bodyStr)
			return false
		}
		var info versionInfo
		dec := json.NewDecoder(resp.Body)
		decErr := dec.Decode(&info)
		resp.Body.Close()
		if decErr != nil {
			logger.Warn("Update check failed: %v", decErr)
			logger.Warn("Continuing with current version: %s", version.BuildVersion)
			return false
		}

		if CompareVersions(version.BuildVersion, info.Version) == 0 {
			logger.Info("Already up to date (%s)", version.BuildVersion)
			return false
		}

		targetVersion = info.Version
		expectedChecksum = info.Checksums[target]
		if expectedChecksum == "" {
			logger.Warn("No checksum available for target %s, skipping integrity check", target)
		}
	}

	logger.Info("Update available: %s → %s", version.BuildVersion, targetVersion)

	binaryPath := platform.GetBinaryInstallPath()
	tmpDir, err := os.MkdirTemp(filepath.Dir(binaryPath), ".glean-mdm-update-*")
	if err != nil {
		logger.Error("Update failed: %v", err)
		return false
	}
	tmpPath := filepath.Join(tmpDir, "binary")

	if !downloadAndInstall(binaryURLPrefix, target, targetVersion, tmpDir, tmpPath, binaryPath, expectedChecksum, currentPlatform) {
		return false
	}

	logger.Info("Updated to %s, re-executing...", targetVersion)

	args := make([]string, 0, len(os.Args))
	for _, a := range os.Args[1:] {
		if a != "--skip-update" {
			args = append(args, a)
		}
	}
	args = append(args, "--skip-update")

	cmd := exec.Command(binaryPath, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		logger.Error("Update failed: %v", err)
		_ = os.RemoveAll(tmpDir)
		return false
	}
	os.Exit(0)
	return true
}

func downloadAndInstall(binaryURLPrefix, target, targetVersion, tmpDir, tmpPath, binaryPath, expectedChecksum string, currentPlatform platform.Platform) bool {
	binaryURL := getBinaryURL(binaryURLPrefix, target, targetVersion)
	logger.Info("Downloading binary from %s", binaryURL)

	resp, err := http.Get(binaryURL)
	if err != nil {
		logger.Error("Update failed: %v", err)
		_ = os.RemoveAll(tmpDir)
		return false
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		logger.Error("Update failed: HTTP %d", resp.StatusCode)
		_ = os.RemoveAll(tmpDir)
		return false
	}
	buffer, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		logger.Error("Update failed: %v", err)
		_ = os.RemoveAll(tmpDir)
		return false
	}
	if err := os.WriteFile(tmpPath, buffer, 0o600); err != nil {
		logger.Error("Update failed: %v", err)
		_ = os.RemoveAll(tmpDir)
		return false
	}

	if expectedChecksum != "" {
		actual := fmt.Sprintf("sha256:%x", sha256.Sum256(buffer))
		if actual != expectedChecksum {
			logger.Error("Checksum mismatch: expected %s, got %s", expectedChecksum, actual)
			_ = os.RemoveAll(tmpDir)
			return false
		}
	}

	if currentPlatform == platform.Win32 {
		installWindows(tmpPath, binaryPath)
	} else {
		if err := os.Chmod(tmpPath, 0o755); err != nil {
			logger.Error("Update failed: %v", err)
			_ = os.RemoveAll(tmpDir)
			return false
		}
		if err := os.Rename(tmpPath, binaryPath); err != nil {
			logger.Error("Update failed: %v", err)
			_ = os.RemoveAll(tmpDir)
			return false
		}
		if currentPlatform == platform.Darwin {
			_ = exec.Command("xattr", "-d", "com.apple.quarantine", binaryPath).Run()
		}
	}
	return true
}

func installWindows(tmpPath, binaryPath string) {
	oldPath := binaryPath + ".old"
	renamed := false
	if err := os.Rename(binaryPath, oldPath); err == nil {
		renamed = true
	}

	if renamed {
		_ = os.Rename(tmpPath, binaryPath)
		_ = os.Remove(oldPath)
	} else {
		if err := copyFile(tmpPath, binaryPath); err != nil {
			pendingPath := binaryPath + ".pending"
			logger.Warn("Binary is locked, writing update to %s", pendingPath)
			_ = os.Rename(tmpPath, pendingPath)
		}
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
