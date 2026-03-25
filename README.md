# Glean MDM

A CLI tool for IT/MDM administrators to automatically configure MCP (Model Context Protocol) servers across all supported AI coding tools on managed devices.

## What it does

`glean-mdm` runs as a system-level process (via launchd, systemd, or Task Scheduler) and ensures every user on a machine has their AI coding tools configured to connect to the organization's Glean MCP server. It:

1. **Reads central configs** (`mcp-config.json` for server definitions, `mdm-config.json` for tool behavior)
2. **Enumerates local users** on the machine (macOS, Linux, or Windows)
3. **Configures each supported host application** by merging the Glean MCP server entry into each tool's config file (JSON, TOML, or YAML), preserving any existing settings
4. **Self-updates** by checking the backend for newer versions before each run

### Supported hosts

Configuration is driven by [`@gleanwork/mcp-config-glean`](https://www.npmjs.com/package/@gleanwork/mcp-config-glean), which maintains the registry of supported clients and their config file paths. This includes tools like Claude Code, Cursor, VS Code, Windsurf, Goose, Codex, and others.

## Usage

```bash
# Show help
glean-mdm --help

# Run for all users (typically as root/admin)
glean-mdm setup

# Dry run for a single user
glean-mdm setup --dry-run --user alice

# Show version
glean-mdm --version

# Install/uninstall the system schedule (launchd/systemd/Task Scheduler)
glean-mdm install-schedule
glean-mdm uninstall-schedule
```

### Generating config files

Use the `config` subcommand to generate both config files:

```bash
glean-mdm config \
  --server-name glean_default \
  --server-url https://your-company-be.glean.com/mcp/default \
  --auto-update \
  --version-url https://your-company-be.glean.com/api/v1/mdm/version \
  --binary-url-prefix https://app.glean.com/static/mdm/binaries
```

This writes `mcp-config.json` and `mdm-config.json` to the platform-specific default directory. Use `--output-dir` to write to a custom location instead.

| Flag | Required | Description |
|------|----------|-------------|
| `--server-name` | yes | Identifier for the MCP server |
| `--server-url` | yes | MCP server endpoint URL |
| `--auto-update` / `--no-auto-update` | yes | Enable or disable automatic binary updates |
| `--version-url` | if `--auto-update` | URL to fetch latest version info |
| `--binary-url-prefix` | yes | Base URL for downloading binaries |
| `--pinned-version` | no | Pin to a specific version (e.g. `1.2.3` or `v1.2.3`) |
| `--output-dir` | no | Directory to write config files to (defaults to platform path) |

### Configuration

Config files are located at the platform-specific default paths:

| Platform | MCP Config | MDM Config |
|----------|------------|------------|
| macOS    | `/Library/Application Support/Glean MDM/mcp-config.json` | `/Library/Application Support/Glean MDM/mdm-config.json` |
| Linux    | `/etc/glean_mdm/mcp-config.json` | `/etc/glean_mdm/mdm-config.json` |
| Windows  | `C:\ProgramData\Glean MDM\mcp-config.json` | `C:\ProgramData\Glean MDM\mdm-config.json` |

Or specify custom paths with `--mcp-config` and `--mdm-config`.

**mcp-config.json** — defines MCP servers (single object or array):

```json
[
  {
    "serverName": "glean_default",
    "url": "https://your-company-be.glean.com/mcp/default"
  }
]
```

**mdm-config.json** — controls MDM tool behavior:

```json
{
  "autoUpdate": true,
  "versionUrl": "https://your-company-be.glean.com/api/v1/mdm/version",
  "binaryUrlPrefix": "https://app.glean.com/static/mdm/binaries",
  "pinnedVersion": "1.2.3"
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `autoUpdate` | boolean | yes | Enable automatic binary updates |
| `versionUrl` | string (URL) | if `autoUpdate` is true | URL to fetch latest version info |
| `binaryUrlPrefix` | string (URL) | yes | Base URL for downloading binaries |
| `pinnedVersion` | string (semver) | no | Pin to a specific version (e.g. `1.2.3` or `v1.2.3`) |

## Development

```bash
# Install dependencies
bun install

# Run tests
bunx vitest run

# Run locally
bun run src/index.ts -- --version
bun run src/index.ts -- setup --dry-run --mcp-config ci/smoke-dry-run-mcp-config.json --mdm-config ci/smoke-dry-run-mdm-config.json --user $(whoami)

# Build binaries for all platforms
./build.sh
```

## Releasing

Push a version tag to trigger the release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This builds cross-platform binaries (macOS arm64/x64, Linux arm64/x64, Windows x64) and publishes them as GitHub release assets.
