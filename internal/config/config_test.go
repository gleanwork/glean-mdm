package config

import "testing"

func TestParseMcpConfig_SingleObject(t *testing.T) {
	cfg, err := ParseMcpConfig([]byte(`{"serverName":"glean_default","url":"https://x/mcp/default"}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Servers) != 1 || cfg.Servers[0].ServerName != "glean_default" {
		t.Errorf("unexpected: %+v", cfg.Servers)
	}
}

func TestParseMcpConfig_Array(t *testing.T) {
	cfg, err := ParseMcpConfig([]byte(`[{"serverName":"a","url":"https://x/mcp/a"},{"serverName":"b","url":"https://x/mcp/b"}]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Servers) != 2 {
		t.Errorf("expected 2, got %d", len(cfg.Servers))
	}
}

func TestParseMcpConfig_EmptyArrayInvalid(t *testing.T) {
	if _, err := ParseMcpConfig([]byte(`[]`)); err == nil {
		t.Error("expected error for empty array")
	}
}

func TestParseMcpConfig_MissingFields(t *testing.T) {
	if _, err := ParseMcpConfig([]byte(`{"serverName":"","url":""}`)); err == nil {
		t.Error("expected validation error for empty fields")
	}
}

func TestParseMdmConfig_AutoUpdateRequiresVersionURL(t *testing.T) {
	if _, err := ParseMdmConfig([]byte(`{"autoUpdate":true,"binaryUrlPrefix":"https://x/bin"}`)); err == nil {
		t.Error("expected error: versionUrl required when autoUpdate true")
	}
}

func TestParseMdmConfig_TrailingSlashStripped(t *testing.T) {
	cfg, err := ParseMdmConfig([]byte(`{"autoUpdate":false,"binaryUrlPrefix":"https://x/bin///"}`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BinaryURLPrefix != "https://x/bin" {
		t.Errorf("trailing slash not stripped: %q", cfg.BinaryURLPrefix)
	}
}

func TestParseMdmConfig_PinnedVersionFiltering(t *testing.T) {
	cfg, err := ParseMdmConfig([]byte(`{"autoUpdate":false,"binaryUrlPrefix":"https://x/bin","pinnedVersion":"not-a-version"}`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PinnedVersion != "" {
		t.Errorf("invalid pinnedVersion should be dropped, got %q", cfg.PinnedVersion)
	}

	cfg, err = ParseMdmConfig([]byte(`{"autoUpdate":false,"binaryUrlPrefix":"https://x/bin","pinnedVersion":"v1.2.3"}`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PinnedVersion != "v1.2.3" {
		t.Errorf("valid pinnedVersion dropped, got %q", cfg.PinnedVersion)
	}
}

func TestParseMdmConfig_InvalidBinaryURL(t *testing.T) {
	if _, err := ParseMdmConfig([]byte(`{"autoUpdate":false,"binaryUrlPrefix":"not a url"}`)); err == nil {
		t.Error("expected error for invalid binaryUrlPrefix")
	}
}

func TestGetBackendURL(t *testing.T) {
	if got := GetBackendURL("https://be.glean.com/mcp/default"); got != "https://be.glean.com" {
		t.Errorf("got %q", got)
	}
}
