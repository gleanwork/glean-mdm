// Package platform centralizes OS/arch detection and platform-specific paths.
package platform

import (
	"fmt"
	"path/filepath"
	"runtime"
)

// Platform is the normalized operating system identifier. The values
// ("darwin", "linux", "win32") match the configPath keys in the embedded
// registry snapshot (internal/registry/registry.json), so Win32 is used rather
// than "windows".
type Platform string

const (
	Darwin Platform = "darwin"
	Linux  Platform = "linux"
	Win32  Platform = "win32"
)

// Get returns the current platform, panicking on unsupported systems to match
// the original implementation's throw behavior.
func Get() Platform {
	switch runtime.GOOS {
	case "darwin":
		return Darwin
	case "linux":
		return Linux
	case "windows":
		return Win32
	default:
		panic(fmt.Sprintf("Unsupported platform: %s", runtime.GOOS))
	}
}

// GetArch returns the normalized architecture using the same names as the
// original ("arm64", "x64").
func GetArch() string {
	switch runtime.GOARCH {
	case "arm64":
		return "arm64"
	case "amd64":
		return "x64"
	default:
		panic(fmt.Sprintf("Unsupported architecture: %s", runtime.GOARCH))
	}
}

// GetTargetName returns the release target identifier, e.g. "darwin-arm64" or
// "windows-x64".
func GetTargetName() string {
	p := Get()
	platformName := string(p)
	if p == Win32 {
		platformName = "windows"
	}
	return fmt.Sprintf("%s-%s", platformName, GetArch())
}

// GetDefaultConfigDir returns the platform-specific config directory.
func GetDefaultConfigDir() string {
	switch Get() {
	case Darwin:
		return "/Library/Application Support/Glean MDM"
	case Linux:
		return "/etc/glean_mdm"
	case Win32:
		return `C:\ProgramData\Glean MDM`
	}
	return ""
}

// GetDefaultMcpConfigPath returns the platform-specific mcp-config.json path.
func GetDefaultMcpConfigPath() string {
	return filepath.Join(GetDefaultConfigDir(), "mcp-config.json")
}

// GetDefaultMdmConfigPath returns the platform-specific mdm-config.json path.
func GetDefaultMdmConfigPath() string {
	return filepath.Join(GetDefaultConfigDir(), "mdm-config.json")
}

// GetLogFilePath returns the platform-specific log file path. On Windows the
// log lives in the config dir; Unix uses the system log directory.
func GetLogFilePath() string {
	if Get() == Win32 {
		return filepath.Join(GetDefaultConfigDir(), "glean-mdm.log")
	}
	return "/var/log/glean-mdm.log"
}

// GetBinaryInstallPath returns the platform-specific installed binary path.
func GetBinaryInstallPath() string {
	if Get() == Win32 {
		return `C:\Program Files\Glean\glean-mdm.exe`
	}
	return "/usr/local/bin/glean-mdm"
}
