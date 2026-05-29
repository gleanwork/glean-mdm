package platform

import (
	"strings"
	"testing"
)

func TestGetArch(t *testing.T) {
	arch := GetArch()
	if arch != "arm64" && arch != "x64" {
		t.Errorf("unexpected arch: %q", arch)
	}
}

func TestGetTargetName(t *testing.T) {
	target := GetTargetName()
	parts := strings.Split(target, "-")
	if len(parts) != 2 {
		t.Fatalf("unexpected target format: %q", target)
	}
	switch parts[0] {
	case "darwin", "linux", "windows":
	default:
		t.Errorf("unexpected platform in target: %q", target)
	}
}

func TestPathsNonEmpty(t *testing.T) {
	if GetDefaultConfigDir() == "" {
		t.Error("config dir empty")
	}
	if GetDefaultMcpConfigPath() == "" {
		t.Error("mcp config path empty")
	}
	if GetBinaryInstallPath() == "" {
		t.Error("binary install path empty")
	}
}
