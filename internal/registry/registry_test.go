package registry

import (
	"testing"

	"github.com/gleanwork/glean-mdm/internal/platform"
)

func TestNormalizeServerName(t *testing.T) {
	cases := map[string]string{
		"default":         "glean_default",
		"glean_default":   "glean_default",
		"analytics":       "glean_analytics",
		"glean_analytics": "glean_analytics",
	}
	for in, want := range cases {
		if got := NormalizeServerName(in); got != want {
			t.Errorf("NormalizeServerName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestClientsLoaded(t *testing.T) {
	clients := Clients()
	if len(clients) == 0 {
		t.Fatal("no clients loaded from registry.json")
	}
	if len(URLPropertyNames()) == 0 {
		t.Error("no URL property names loaded")
	}
}

func findClient(t *testing.T, id string) *Client {
	t.Helper()
	for _, c := range Clients() {
		if c.ID == id {
			return c
		}
	}
	t.Fatalf("client %q not found", id)
	return nil
}

func TestBuildEntry_Cursor(t *testing.T) {
	c := findClient(t, "cursor")
	entry := c.BuildEntry("default", "https://be.glean.com/mcp/default")
	if entry["url"] != "https://be.glean.com/mcp/default" {
		t.Errorf("url not substituted: %v", entry["url"])
	}
	if entry["type"] != "http" {
		t.Errorf("expected type http, got %v", entry["type"])
	}
}

func TestBuildEntry_GooseNameSubstitution(t *testing.T) {
	c := findClient(t, "goose")
	entry := c.BuildEntry("default", "https://be.glean.com/mcp/default")
	// Goose embeds the (normalized) server name inside the entry.
	if entry["name"] != "glean_default" {
		t.Errorf("goose name not substituted to normalized name: %v", entry["name"])
	}
	if entry["uri"] != "https://be.glean.com/mcp/default" {
		t.Errorf("goose uri not substituted: %v", entry["uri"])
	}
	// Ensure no placeholder token leaked through.
	if entry["name"] == "glean_GLEANMDMSERVERNAMETOKEN" {
		t.Error("placeholder token leaked into output")
	}
}

func TestBuildEntry_AlreadyPrefixedName(t *testing.T) {
	c := findClient(t, "goose")
	entry := c.BuildEntry("glean_analytics", "https://be.glean.com/mcp/analytics")
	if entry["name"] != "glean_analytics" {
		t.Errorf("expected no double prefix, got %v", entry["name"])
	}
}

func TestConfigPathFor_JetbrainsNoPath(t *testing.T) {
	c := findClient(t, "jetbrains")
	if _, ok := c.ConfigPathFor(platform.Darwin); ok {
		t.Error("jetbrains should have no darwin config path")
	}
}
