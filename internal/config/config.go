// Package config reads and validates mcp-config.json and mdm-config.json,
// replacing the zod schemas from the original config.ts.
package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/gleanwork/glean-mdm/internal/platform"
)

var (
	semverPattern   = regexp.MustCompile(`^v?\d+\.\d+\.\d+$`)
	trailingSlashRE = regexp.MustCompile(`/+$`)
	mcpPathSuffixRE = regexp.MustCompile(`/mcp/.*$`)
)

// ValidationError mirrors the user-facing zod validation failures so the CLI can
// print "Validation error: ..." and exit non-zero.
type ValidationError struct {
	Messages []string
}

func (e *ValidationError) Error() string {
	return "Validation error: " + strings.Join(e.Messages, ", ")
}

// McpServerEntry is a single MCP server definition.
type McpServerEntry struct {
	ServerName string `json:"serverName"`
	URL        string `json:"url"`
}

// McpConfig holds the parsed list of MCP servers.
type McpConfig struct {
	Servers []McpServerEntry
}

// MdmConfig holds MDM tool behavior. Empty string fields mean "not provided".
type MdmConfig struct {
	AutoUpdate      bool
	VersionURL      string
	PinnedVersion   string
	BinaryURLPrefix string
}

// GetServerURL returns the server's URL.
func GetServerURL(s McpServerEntry) string { return s.URL }

// GetBackendURL strips the /mcp/... suffix from a server URL.
func GetBackendURL(u string) string {
	return mcpPathSuffixRE.ReplaceAllString(u, "")
}

func isValidURL(s string) bool {
	parsed, err := url.Parse(s)
	return err == nil && parsed.Scheme != "" && parsed.Host != ""
}

// ParseMcpConfig validates raw JSON bytes into an McpConfig. Accepts a single
// object or a non-empty array.
func ParseMcpConfig(raw []byte) (McpConfig, error) {
	trimmed := bytes.TrimSpace(raw)
	var entries []McpServerEntry

	if len(trimmed) > 0 && trimmed[0] == '[' {
		if err := json.Unmarshal(trimmed, &entries); err != nil {
			return McpConfig{}, &ValidationError{Messages: []string{"invalid mcp-config.json: " + err.Error()}}
		}
		if len(entries) == 0 {
			return McpConfig{}, &ValidationError{Messages: []string{"mcp-config.json array must contain at least one entry"}}
		}
	} else {
		var single McpServerEntry
		if err := json.Unmarshal(trimmed, &single); err != nil {
			return McpConfig{}, &ValidationError{Messages: []string{"invalid mcp-config.json: " + err.Error()}}
		}
		entries = []McpServerEntry{single}
	}

	var msgs []string
	for i, e := range entries {
		if e.ServerName == "" {
			msgs = append(msgs, fmt.Sprintf("entry %d: serverName must not be empty", i))
		}
		if e.URL == "" {
			msgs = append(msgs, fmt.Sprintf("entry %d: url must not be empty", i))
		}
	}
	if len(msgs) > 0 {
		return McpConfig{}, &ValidationError{Messages: msgs}
	}
	return McpConfig{Servers: entries}, nil
}

// ParseMdmConfig validates raw JSON bytes into an MdmConfig.
func ParseMdmConfig(raw []byte) (MdmConfig, error) {
	var rawObj struct {
		AutoUpdate      *bool   `json:"autoUpdate"`
		VersionURL      *string `json:"versionUrl"`
		PinnedVersion   *string `json:"pinnedVersion"`
		BinaryURLPrefix *string `json:"binaryUrlPrefix"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(raw), &rawObj); err != nil {
		return MdmConfig{}, &ValidationError{Messages: []string{"invalid mdm-config.json: " + err.Error()}}
	}

	var msgs []string
	cfg := MdmConfig{}

	if rawObj.AutoUpdate == nil {
		msgs = append(msgs, "autoUpdate is required")
	} else {
		cfg.AutoUpdate = *rawObj.AutoUpdate
	}

	if rawObj.VersionURL != nil {
		if !isValidURL(*rawObj.VersionURL) {
			msgs = append(msgs, "versionUrl must be a valid URL")
		} else {
			cfg.VersionURL = *rawObj.VersionURL
		}
	}

	// pinnedVersion is dropped (not an error) unless it matches the semver shape.
	if rawObj.PinnedVersion != nil && semverPattern.MatchString(*rawObj.PinnedVersion) {
		cfg.PinnedVersion = *rawObj.PinnedVersion
	}

	if rawObj.BinaryURLPrefix == nil {
		msgs = append(msgs, "binaryUrlPrefix is required")
	} else {
		prefix := *rawObj.BinaryURLPrefix
		if prefix != "" {
			prefix = trailingSlashRE.ReplaceAllString(prefix, "")
		}
		if !isValidURL(prefix) {
			msgs = append(msgs, "binaryUrlPrefix must be a valid URL")
		} else {
			cfg.BinaryURLPrefix = prefix
		}
	}

	if cfg.AutoUpdate && cfg.VersionURL == "" {
		msgs = append(msgs, "versionUrl is required when autoUpdate is true")
	}

	if len(msgs) > 0 {
		return MdmConfig{}, &ValidationError{Messages: msgs}
	}
	return cfg, nil
}

// ReadMcpConfig reads and validates the MCP config file.
func ReadMcpConfig(configPath string) (McpConfig, error) {
	if configPath == "" {
		configPath = platform.GetDefaultMcpConfigPath()
	}
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return McpConfig{}, err
	}
	return ParseMcpConfig(raw)
}

// ReadMdmConfig reads and validates the MDM config file.
func ReadMdmConfig(configPath string) (MdmConfig, error) {
	if configPath == "" {
		configPath = platform.GetDefaultMdmConfigPath()
	}
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return MdmConfig{}, err
	}
	return ParseMdmConfig(raw)
}
