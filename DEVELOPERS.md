# Developer Guide

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

All platforms log to both stdout and a log file. The log file rotates automatically when it exceeds 10MB (the file gets truncated).

| Platform | Log path |
|----------|----------|
| macOS | `/var/log/glean-mdm.log` |
| Linux | `/var/log/glean-mdm.log` |
| Windows | `C:\ProgramData\Glean MDM\glean-mdm.log` |

On macOS, the LaunchDaemon's stdout/stderr is also configured to write to `/var/log/glean-mdm.log`, so everything ends up in one place.

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

| Platform | Mechanism | Schedule | Runs as |
|----------|-----------|----------|---------|
| macOS | LaunchDaemon (`/Library/LaunchDaemons/com.glean.mdm.plist`) | Daily at 9:00 AM + on load | root |
| Linux | systemd timer (`glean-mdm.timer` / `glean-mdm.service`) | Daily | root |
| Windows | Task Scheduler (`Glean MDM`) | Daily at 9:00 AM | SYSTEM |
