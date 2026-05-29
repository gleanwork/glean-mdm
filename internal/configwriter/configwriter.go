// Package configwriter implements the `config` subcommand: generating
// mcp-config.json and mdm-config.json, mirroring config-writer.ts.
package configwriter

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/gleanwork/glean-mdm/internal/config"
	"github.com/gleanwork/glean-mdm/internal/fsutil"
	"github.com/gleanwork/glean-mdm/internal/jsonutil"
	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/platform"
)

// Options controls config file generation.
type Options struct {
	ServerName      string
	ServerURL       string
	AutoUpdate      bool
	VersionURL      string
	BinaryURLPrefix string
	PinnedVersion   string
	OutputDir       string
}

// mdmOutput controls the serialized key order (autoUpdate, versionUrl,
// pinnedVersion, binaryUrlPrefix), matching the original schema shape.
type mdmOutput struct {
	AutoUpdate      bool   `json:"autoUpdate"`
	VersionURL      string `json:"versionUrl,omitempty"`
	PinnedVersion   string `json:"pinnedVersion,omitempty"`
	BinaryURLPrefix string `json:"binaryUrlPrefix"`
}

func readExistingMcpEntries(filePath string) ([]config.McpServerEntry, error) {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	cfg, err := config.ParseMcpConfig(raw)
	if err != nil {
		return nil, err
	}
	return cfg.Servers, nil
}

// Write generates the mcp-config.json and mdm-config.json files.
func Write(opts Options) error {
	outputDir := opts.OutputDir
	if outputDir == "" {
		outputDir = platform.GetDefaultConfigDir()
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}

	newEntry := config.McpServerEntry{ServerName: opts.ServerName, URL: opts.ServerURL}

	// Validate the new MCP entry (non-empty serverName/url).
	entryJSON, _ := json.Marshal([]config.McpServerEntry{newEntry})
	if _, err := config.ParseMcpConfig(entryJSON); err != nil {
		return err
	}

	// Validate MDM options and capture normalized values (trailing-slash strip,
	// semver filtering, autoUpdate/versionUrl refinement).
	mdmRaw := map[string]any{
		"autoUpdate":      opts.AutoUpdate,
		"binaryUrlPrefix": opts.BinaryURLPrefix,
	}
	if opts.VersionURL != "" {
		mdmRaw["versionUrl"] = opts.VersionURL
	}
	if opts.PinnedVersion != "" {
		mdmRaw["pinnedVersion"] = opts.PinnedVersion
	}
	mdmRawJSON, _ := json.Marshal(mdmRaw)
	parsedMdm, err := config.ParseMdmConfig(mdmRawJSON)
	if err != nil {
		return err
	}

	mcpPath := filepath.Join(outputDir, "mcp-config.json")
	existing, err := readExistingMcpEntries(mcpPath)
	if err != nil {
		return err
	}

	var nameMatch, urlMatch *config.McpServerEntry
	for i := range existing {
		if existing[i].ServerName == newEntry.ServerName {
			nameMatch = &existing[i]
		}
		if existing[i].URL == newEntry.URL {
			urlMatch = &existing[i]
		}
	}

	switch {
	case nameMatch != nil:
		logger.Info("Skipped %s (entry %q already exists)", mcpPath, newEntry.ServerName)
	case urlMatch != nil:
		logger.Info("Skipped %s (URL %q already configured under %q)", mcpPath, newEntry.URL, urlMatch.ServerName)
	default:
		merged := append(append([]config.McpServerEntry(nil), existing...), newEntry)
		data, err := jsonutil.MarshalIndent(merged)
		if err != nil {
			return err
		}
		if err := fsutil.AtomicWrite(mcpPath, data); err != nil {
			return err
		}
		logger.Info("Added entry %q to %s", newEntry.ServerName, mcpPath)
	}

	mdmPath := filepath.Join(outputDir, "mdm-config.json")
	mdmData, err := jsonutil.MarshalIndent(mdmOutput{
		AutoUpdate:      parsedMdm.AutoUpdate,
		VersionURL:      parsedMdm.VersionURL,
		PinnedVersion:   parsedMdm.PinnedVersion,
		BinaryURLPrefix: parsedMdm.BinaryURLPrefix,
	})
	if err != nil {
		return err
	}
	if err := fsutil.AtomicWrite(mdmPath, mdmData); err != nil {
		return err
	}
	logger.Info("Wrote %s", mdmPath)

	return nil
}
