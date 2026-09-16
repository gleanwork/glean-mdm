---
name: glean-mdm
description: Retire the deprecated glean-mdm system schedule on managed devices. Use when operating or troubleshooting the schedule-only retirement release, or interpreting legacy deployment scripts. New provisioning uses glean-helper.
---

# glean-mdm

`glean-mdm` is deprecated in favor of `glean-helper`. This release only retires the legacy system schedule. It does not migrate configuration to helper, install helper, or delete itself.

## When to use

Load when retiring or troubleshooting an existing `glean-mdm` deployment. For new provisioning, use `glean-helper` and its documented API. Do not generate new provisioning instructions using `glean-mdm`.

## Install & import

The CLI is a self-contained per-platform binary built with `./build.sh` and published as GitHub release assets. It is not an npm import. Older releases can download this retirement release through their configured version endpoint and binary feed. Pinned, update-disabled, offline, or custom-feed installations may require an admin deployment.

## Authoritative API

Read the CLI definitions in `src/index.ts` and each command's `--help` rather than guessing flags. Legacy config schemas remain in `src/config.ts` for the compatibility `config` command.

## Usage patterns

1. Preview with `glean-mdm run --dry-run`. This does not change the schedule.
2. Run `glean-mdm run` as root/admin or Windows SYSTEM to remove the legacy launchd, systemd, or Task Scheduler schedule if present.
3. Deploy/configure helper and remove leftover files using a separate admin MDM script when ready.

`run` no longer reads configuration, checks for updates, enumerates users, configures MCP clients, or installs extensions. It leaves the binary, central config, client settings, logs, and installed editor extensions in place. Normal logging still occurs. Existing client settings remain usable, but recurring provisioning stops.

Runs remain serialized with a machine-wide lock, including when invoked by an older updating parent. Overlapping runs skip successfully. Schedule removal is idempotent; actual permission or scheduler failures return an error. On macOS, unloading the active LaunchDaemon can terminate the invocation, so the persistent plist must be removed before unloading.

## Compatibility commands and flags

- `install-schedule` is a deprecated no-op. It neither installs nor removes a schedule. An older deployment script must still invoke `run` to retire an existing schedule.
- `uninstall-schedule` explicitly removes only the schedule and supports `--dry-run`.
- `--user`, `--skip-update`, `--mcp-config`, and `--mdm-config` remain accepted by `run` but are ignored. Retirement is machine-wide even with `--user`. Missing or malformed legacy configs do not block retirement.
- `config` still generates legacy config files for script compatibility. They do not configure helper or enable self-updates in this release.
- `uninstall` remains an explicit full-uninstall command (schedule, binary, config, logs). It is NOT called by retirement. Windows binary removal is best-effort. Use `--keep-config` to preserve central config; do not assume the global dry-run flag protects this legacy full-uninstall command.

## Common mistakes

- Expecting retirement to install or configure helper automatically.
- Removing the macOS job before deleting its plist: unloading can stop the running process before the persistent schedule is removed.
- Treating `--skip-update` as an opt-out from retirement: old updaters pass it to the downloaded binary, which must still retire the schedule.
- Assuming binary publication reaches every device. Keep legacy release assets available and update version feeds and customer MDM policies separately; older binaries can still recreate schedules.
- Running legacy privileged E2E scripts on a developer machine. Schedule/uninstall tests modify system paths and must run only on disposable CI machines.

## Version notes

Check `glean-mdm --version`. This release never self-updates. Log paths and retained configuration paths are documented in `README.md` and `DEVELOPERS.md`.
