---
name: glean-mdm
description: Use the glean-mdm CLI to provision Glean's AI-coding-tool integration on managed devices (IT/MDM fleet tooling) — install the Glean editor extension and configure MCP servers across supported AI coding tools for every user on a machine, on a system schedule. Load when operating, scripting, or troubleshooting glean-mdm on a managed device.
---

# glean-mdm

A system-level CLI for IT/MDM administrators that provisions Glean's AI-coding-tool integration across every user on a managed machine. On each run it installs the Glean editor extension into supported editors, merges the organization's Glean MCP server entry into each tool's config (preserving existing settings), and self-updates. It runs unattended via the OS scheduler (launchd / systemd / Task Scheduler).

## When to use

Load this skill when operating, scripting, or troubleshooting `glean-mdm` on a managed device — generating its config files, installing/removing the system schedule, or running the per-user provisioner. This is **fleet** tooling, run by an admin (typically as root) to set up *all* users on a machine. It is broader than MCP setup: configuring MCP servers is one of its jobs, alongside installing the Glean editor extension. For a single developer configuring their own MCP clients interactively, that's `@gleanwork/configure-mcp-server`, not this.

## Install & import

`glean-mdm` is distributed as a self-contained per-platform binary (built from this repo via `./build.sh` and shipped as GitHub release assets, deployed by your MDM). It is not an npm import. Invoke the command directly:

```bash
glean-mdm --help
```

The set of supported editors/tools and their config-file paths is not defined here — it comes from the [`@gleanwork/mcp-config-glean`](https://www.npmjs.com/package/@gleanwork/mcp-config-glean) registry (Claude Code, Cursor, VS Code, Windsurf, Goose, Codex, …).

## Authoritative API

The command surface is the source of truth, not any prose. Read it rather than guessing flags:

- `glean-mdm --help` and each subcommand's `--help` (`run`, `config`, `install-schedule`, `uninstall-schedule`, `uninstall`)
- the commander definitions and the `CliOptions` interface in `src/index.ts`
- the config-file schemas (`McpConfigSchema`, `MdmConfigSchema`) in `src/config.ts`, and the documented shapes in `README.md`

Don't transcribe the flag or schema lists — they drift. Check `--help` and the Zod schemas for the exact options.

## Usage patterns

The normal admin workflow is **config → install-schedule → run**:

- **`config`** generates two files into the platform default directory (override with `--output-dir`):
  - `mcp-config.json` — the MCP server(s) to provision (`serverName`, `url`).
  - `mdm-config.json` — the binary's own update behavior (`autoUpdate`, `versionUrl`, `binaryUrlPrefix`, `pinnedVersion`).
- **`install-schedule`** registers the system runner (launchd / systemd / Task Scheduler); `uninstall-schedule` removes it; `uninstall` removes everything (schedule, config, logs, binary).
- **`run`** does the per-user work: for each local user it installs the Glean editor extension, configures the MCP server entry in each supported host tool, then checks for a self-update. Run it as root/admin so it can enumerate all users and write their configs.
- **Always dry-run first:** `glean-mdm run --dry-run [--user <name>]` previews changes; scope to one user with `--user`. Point at explicit configs with `--mcp-config` / `--mdm-config`.
- **Self-update** runs before the work unless suppressed; logs go to the platform log file (e.g. `/var/log/glean-mdm.log`), rotated at 10 MB.

## Common mistakes

- **Running `run` without admin/root** — it must enumerate all local users and write per-user configs and extensions; unprivileged runs fail or no-op.
- **Treating it as MCP-only** — `run` also installs the Glean editor extension; it's a general provisioning agent, not just an MCP config writer.
- **Confusing it with `configure-mcp-server`** — that's single-user interactive MCP setup; `glean-mdm` is unattended fleet provisioning across all users.
- **`autoUpdate: true` without a `versionUrl`** — auto-update needs the version endpoint to check against.
- **Skipping `--dry-run`** before a real run on a fleet machine, or **hand-editing tool config files** instead of letting `run` merge (it preserves existing settings).

## Version notes

Check the running version with `glean-mdm --version`. Binaries self-update against the `mdm-config.json` `versionUrl` (set `pinnedVersion` to opt out) and are built per-platform via `./build.sh`, published as GitHub release assets on a version tag. Don't hardcode a version — read it from the binary.
