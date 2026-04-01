# Developer Guide

## Configuration files

All paths are defined in `src/platform.ts`.

### Config directory

| Platform | Path |
|----------|------|
| macOS | `/Library/Application Support/Glean MDM` |
| Linux | `/etc/glean_mdm` |
| Windows | `C:\ProgramData\Glean MDM` |

### MCP config

| Platform | Path |
|----------|------|
| macOS | `/Library/Application Support/Glean MDM/mcp-config.json` |
| Linux | `/etc/glean_mdm/mcp-config.json` |
| Windows | `C:\ProgramData\Glean MDM\mcp-config.json` |

### MDM config

| Platform | Path |
|----------|------|
| macOS | `/Library/Application Support/Glean MDM/mdm-config.json` |
| Linux | `/etc/glean_mdm/mdm-config.json` |
| Windows | `C:\ProgramData\Glean MDM\mdm-config.json` |

### Binary install path

| Platform | Path |
|----------|------|
| macOS | `/usr/local/bin/glean-mdm` |
| Linux | `/usr/local/bin/glean-mdm` |
| Windows | `C:\Program Files\Glean\glean-mdm.exe` |

## Verifying the schedule

After running `glean-mdm install-schedule`, use the following commands to verify the schedule is set up correctly.

### macOS

```bash
# Check that the plist file was written
cat /Library/LaunchDaemons/com.glean.mdm.plist

# Check that the daemon is loaded
sudo launchctl list | grep glean

# Get detailed status
sudo launchctl print system/com.glean.mdm

# Force an immediate run for local testing
sudo launchctl kickstart -k system/com.glean.mdm
```

Expected output from `sudo launchctl list | grep glean`:

```
-       0       com.glean.mdm
```

| Column | Value | Meaning |
|--------|-------|---------|
| PID | `-` | Not currently running (it's a scheduled job, not a long-running daemon) |
| Last exit status | `0` | Last run completed successfully |
| Label | `com.glean.mdm` | The daemon identifier |

A PID of `-` is normal since the daemon runs once and exits. A non-zero exit status indicates the last run failed.

### Linux

```bash
# Check timer status
systemctl status glean-mdm.timer

# Check service status
systemctl status glean-mdm.service

# List all timers to see next run time
systemctl list-timers glean-mdm.timer
```

### Windows

```powershell
schtasks /Query /TN "Glean MDM"
```

## Logs

All platforms write structured logs to a platform log file. The log file rotates automatically when it exceeds 10MB (the file gets truncated).

| Platform | Log path |
|----------|----------|
| macOS | `/var/log/glean-mdm.log` |
| Linux | `/var/log/glean-mdm.log` |
| Windows | `C:\ProgramData\Glean MDM\glean-mdm.log` |

On macOS, `/var/log/glean-mdm.log` is written by the app logger directly. The LaunchDaemon does not redirect stdout/stderr into that file.

To tail logs:

```bash
# macOS / Linux
sudo tail -f /var/log/glean-mdm.log
```

## Uninstalling the schedule

```bash
# Remove the scheduled task (does not remove the binary or config files)
sudo glean-mdm uninstall-schedule

# Full uninstall (removes schedule, but binary and config must be removed manually)
sudo glean-mdm uninstall
```

## Schedule details by platform

| Platform | Mechanism | Schedule | Missed run? | Runs as |
|----------|-----------|----------|-------------|---------|
| macOS | LaunchDaemon (`/Library/LaunchDaemons/com.glean.mdm.plist`) | Daily at 9:XX AM + on load | Runs on next boot/wake | root |
| Linux | systemd timer (`glean-mdm.timer` / `glean-mdm.service`) | Daily at 9:XX AM | Runs on next boot (`Persistent=true`) | root |
| Windows | Task Scheduler (`Glean MDM`) | Daily at 9:XX AM | Runs when available (`StartWhenAvailable`) | SYSTEM |

> **Note:** The minute (XX) is randomized per-machine at install time to stagger requests to the version endpoint.
