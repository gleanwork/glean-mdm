# Glean MDM

A CLI tool for IT/MDM administrators to automatically configure MCP (Model Context Protocol) servers across all supported AI coding tools on managed devices.

## What it does

`glean-mdm` runs as a system-level process (via launchd, systemd, or Task Scheduler) and ensures every user on a machine has their AI coding tools configured to connect to the organization's Glean MCP server. It:

1. **Reads a central config** (`mcp-config.json`) specifying the Glean server name and URL
2. **Enumerates local users** on the machine (macOS, Linux, or Windows)
3. **Configures each supported host application** by merging the Glean MCP server entry into each tool's config file (JSON, TOML, or YAML), preserving any existing settings
4. **Self-updates** by checking the backend for newer versions before each run

### Supported hosts

Configuration is driven by [`@gleanwork/mcp-config-glean`](https://www.npmjs.com/package/@gleanwork/mcp-config-glean), which maintains the registry of supported clients and their config file paths. This includes tools like Claude Code, Cursor, VS Code, Windsurf, Goose, Codex, and others.

## Usage

```bash
# Run for all users (typically as root/admin)
glean-mdm

# Dry run for a single user
glean-mdm --dry-run --user alice

# Show version
glean-mdm --version

# Install/uninstall the system schedule (launchd/systemd/Task Scheduler)
glean-mdm install-schedule
glean-mdm uninstall-schedule
```

### Configuration

Place `mcp-config.json` at the platform-specific default path:

| Platform | Path |
|----------|------|
| macOS    | `/Library/Application Support/Glean MDM/mcp-config.json` |
| Linux    | `/etc/glean_mdm/mcp-config.json` |
| Windows  | `C:\ProgramData\Glean MDM\mcp-config.json` |

Or specify a custom path with `--config /path/to/config.json`.

The config file can contain a single server object or an array of server objects:

**Single server:**

```json
{
  "serverName": "glean_default",
  "url": "https://your-company-be.glean.com/mcp/default",
  "binaryUrlPrefix": "https://app.glean.com/static/mdm/binaries"
}
```

**Multiple servers:**

```json
[
  {
    "serverName": "glean_default",
    "url": "https://your-company-be.glean.com/mcp/default",
    "binaryUrlPrefix": "https://app.glean.com/static/mdm/binaries"
  },
  {
    "serverName": "glean_secondary",
    "url": "https://your-company-be.glean.com/mcp/secondary",
    "binaryUrlPrefix": "https://app.glean.com/static/mdm/binaries"
  }
]
```

Each server object supports the following properties:

| Property | Required | Description |
|----------|----------|-------------|
| `serverName` | Yes | Name for the MCP server entry in host configs |
| `url` | Yes | Full URL to the Glean MCP server endpoint |
| `binaryUrlPrefix` | Yes | Base URL for downloading binary updates |
| `autoUpdate` | No | Enable/disable auto-updates (default: `true`) |
| `pinnedVersion` | No | Pin to a specific semver version (e.g. `"1.2.3"` or `"v1.2.3"`) |

When multiple servers are configured, each host application will be configured with all server entries. Auto-update uses the first server entry in the array.

## Development

```bash
# Install dependencies
bun install

# Run tests
bunx vitest run

# Run locally
bun run src/index.ts -- --version
bun run src/index.ts -- --dry-run --config ci/smoke-dry-run-config.json --user $(whoami)

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
