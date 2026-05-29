package hosts

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func readJSON(t *testing.T, path string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal %s: %v", path, err)
	}
	return m
}

func mcpServers(m map[string]any) map[string]any {
	s, _ := m["mcpServers"].(map[string]any)
	return s
}

func TestConfigureJSONFile_CreatesNew(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")

	cfg := map[string]any{"mcpServers": map[string]any{
		"glean_default": map[string]any{"type": "http", "url": "https://example-be.glean.com/mcp/default"},
	}}
	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}

	got := mcpServers(readJSON(t, path))["glean_default"]
	want := map[string]any{"type": "http", "url": "https://example-be.glean.com/mcp/default"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestConfigureJSONFile_MergesPreservingOthers(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")
	seed := `{"mcpServers":{"other_server":{"type":"sse","url":"https://other.com"}},"someOtherSetting":true}`
	if err := os.WriteFile(path, []byte(seed), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := map[string]any{"mcpServers": map[string]any{
		"glean_default": map[string]any{"type": "http", "url": "https://example-be.glean.com/mcp/default"},
	}}
	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}

	result := readJSON(t, path)
	servers := mcpServers(result)
	if !reflect.DeepEqual(servers["other_server"], map[string]any{"type": "sse", "url": "https://other.com"}) {
		t.Errorf("other_server not preserved: %v", servers["other_server"])
	}
	if servers["glean_default"] == nil {
		t.Error("glean_default missing")
	}
	if result["someOtherSetting"] != true {
		t.Error("someOtherSetting not preserved")
	}
}

func TestConfigureJSONFile_Idempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")
	cfg := map[string]any{"mcpServers": map[string]any{
		"glean_default": map[string]any{"type": "http", "url": "https://example-be.glean.com/mcp/default"},
	}}

	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}
	first, _ := os.ReadFile(path)
	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}
	second, _ := os.ReadFile(path)

	if string(first) != string(second) {
		t.Errorf("not idempotent:\nfirst=%s\nsecond=%s", first, second)
	}
}

func TestConfigureJSONFile_SkipsDuplicateURLDifferentName(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")
	seed := `{"mcpServers":{"glean":{"type":"http","url":"https://example-be.glean.com/mcp/default"}}}`
	if err := os.WriteFile(path, []byte(seed), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := map[string]any{"mcpServers": map[string]any{
		"glean_default": map[string]any{"type": "http", "url": "https://example-be.glean.com/mcp/default"},
	}}
	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}

	servers := mcpServers(readJSON(t, path))
	if len(servers) != 1 || servers["glean"] == nil {
		t.Errorf("expected only glean entry, got %v", servers)
	}
}

func TestConfigureJSONFile_DedupAcrossURLPropertyNames(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")
	seed := `{"mcpServers":{"server_url":{"url":"https://example-be.glean.com/mcp/default"}}}`
	if err := os.WriteFile(path, []byte(seed), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := map[string]any{"mcpServers": map[string]any{
		"server_serverUrl": map[string]any{"serverUrl": "https://example-be.glean.com/mcp/default"},
	}}
	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}

	servers := mcpServers(readJSON(t, path))
	if len(servers) != 1 || servers["server_url"] == nil {
		t.Errorf("expected only server_url, got %v", servers)
	}
}

func TestConfigureJSONFile_DedupWithinIncoming(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")

	cfg := map[string]any{"mcpServers": map[string]any{
		"glean_old": map[string]any{"type": "http", "url": "https://example-be.glean.com/mcp/default"},
		"glean_new": map[string]any{"type": "http", "url": "https://example-be.glean.com/mcp/default"},
	}}
	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}

	servers := mcpServers(readJSON(t, path))
	if len(servers) != 1 {
		t.Errorf("expected 1 entry after incoming dedup, got %d: %v", len(servers), servers)
	}
}

func TestConfigureJSONFile_CreatesNestedDirs(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nested", "deep", "mcp.json")

	cfg := map[string]any{"mcpServers": map[string]any{
		"glean_default": map[string]any{"url": "https://example-be.glean.com/mcp/default"},
	}}
	if err := configureJSONFile(cfg, path); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("nested file not created: %v", err)
	}
}

func TestConfigureTOMLAndYAML_Idempotent(t *testing.T) {
	dir := t.TempDir()

	tomlPath := filepath.Join(dir, "config.toml")
	tomlCfg := map[string]any{"mcp_servers": map[string]any{
		"glean_default": map[string]any{"url": "https://example-be.glean.com/mcp/default", "http_headers": map[string]any{"X-Glean-Metadata": "mdm"}},
	}}
	if err := configureTOMLFile(tomlCfg, tomlPath); err != nil {
		t.Fatal(err)
	}
	t1, _ := os.ReadFile(tomlPath)
	if err := configureTOMLFile(tomlCfg, tomlPath); err != nil {
		t.Fatal(err)
	}
	t2, _ := os.ReadFile(tomlPath)
	if string(t1) != string(t2) {
		t.Errorf("TOML not idempotent:\n%s\n---\n%s", t1, t2)
	}

	yamlPath := filepath.Join(dir, "config.yaml")
	yamlCfg := map[string]any{"extensions": map[string]any{
		"glean_default": map[string]any{"enabled": true, "type": "streamable_http", "uri": "https://example-be.glean.com/mcp/default", "timeout": 300},
	}}
	if err := configureYAMLFile(yamlCfg, yamlPath); err != nil {
		t.Fatal(err)
	}
	y1, _ := os.ReadFile(yamlPath)
	if err := configureYAMLFile(yamlCfg, yamlPath); err != nil {
		t.Fatal(err)
	}
	y2, _ := os.ReadFile(yamlPath)
	if string(y1) != string(y2) {
		t.Errorf("YAML not idempotent:\n%s\n---\n%s", y1, y2)
	}
}
