package configwriter

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/gleanwork/glean-mdm/internal/config"
	"github.com/gleanwork/glean-mdm/internal/logger"
)

func TestMain(m *testing.M) {
	// Route logger to a temp file so tests don't require the platform log path.
	f, _ := os.CreateTemp("", "configwriter-log-*")
	logger.Init(f.Name())
	code := m.Run()
	_ = os.Remove(f.Name())
	os.Exit(code)
}

func readEntries(t *testing.T, path string) []config.McpServerEntry {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var entries []config.McpServerEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		t.Fatal(err)
	}
	return entries
}

func TestWrite_CreatesAndAppends(t *testing.T) {
	dir := t.TempDir()

	if err := Write(Options{
		ServerName: "glean_default", ServerURL: "https://a/mcp/default",
		AutoUpdate: false, BinaryURLPrefix: "https://x/bin", OutputDir: dir,
	}); err != nil {
		t.Fatal(err)
	}

	mcpPath := filepath.Join(dir, "mcp-config.json")
	if got := readEntries(t, mcpPath); len(got) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(got))
	}

	// Same server-name: should skip (no second entry).
	if err := Write(Options{
		ServerName: "glean_default", ServerURL: "https://different/mcp/default",
		AutoUpdate: false, BinaryURLPrefix: "https://x/bin", OutputDir: dir,
	}); err != nil {
		t.Fatal(err)
	}
	entries := readEntries(t, mcpPath)
	if len(entries) != 1 || entries[0].URL != "https://a/mcp/default" {
		t.Fatalf("skip-by-name failed: %+v", entries)
	}

	// New server-name: should append.
	if err := Write(Options{
		ServerName: "glean_second", ServerURL: "https://b/mcp/default",
		AutoUpdate: false, BinaryURLPrefix: "https://x/bin", OutputDir: dir,
	}); err != nil {
		t.Fatal(err)
	}
	if got := readEntries(t, mcpPath); len(got) != 2 {
		t.Fatalf("expected 2 entries after append, got %d", len(got))
	}
}

func TestWrite_MdmOutput(t *testing.T) {
	dir := t.TempDir()
	if err := Write(Options{
		ServerName: "glean_default", ServerURL: "https://a/mcp/default",
		AutoUpdate: true, VersionURL: "https://v/version", BinaryURLPrefix: "https://x/bin/", OutputDir: dir,
	}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "mdm-config.json"))
	if err != nil {
		t.Fatal(err)
	}
	var mdm map[string]any
	if err := json.Unmarshal(raw, &mdm); err != nil {
		t.Fatal(err)
	}
	if mdm["autoUpdate"] != true {
		t.Error("autoUpdate not true")
	}
	if mdm["binaryUrlPrefix"] != "https://x/bin" {
		t.Errorf("trailing slash not stripped: %v", mdm["binaryUrlPrefix"])
	}
	if mdm["versionUrl"] != "https://v/version" {
		t.Errorf("versionUrl missing: %v", mdm["versionUrl"])
	}
}
