#!/bin/bash
set -euo pipefail

BINARY="${1:?Usage: e2e-schedule-test.sh <binary>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Guard against changing a developer machine before installing the cleanup trap.
source "$SCRIPT_DIR/legacy-schedule-fixture.sh"
RUN_OUTPUT="$(mktemp)"

case "$(uname -s)" in
  Linux)
    INSTALL_PATH="/usr/local/bin/glean-mdm"
    CONFIG_DIR="/etc/glean_mdm"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="systemd"
    SERVICE_FILE="/etc/systemd/system/glean-mdm.service"
    TIMER_FILE="/etc/systemd/system/glean-mdm.timer"
    SUDO="sudo"
    ;;
  Darwin)
    INSTALL_PATH="/usr/local/bin/glean-mdm"
    CONFIG_DIR="/Library/Application Support/Glean MDM"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="launchdaemon"
    PLIST_FILE="/Library/LaunchDaemons/com.glean.mdm.plist"
    SUDO="sudo"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    INSTALL_PATH="/c/Program Files/Glean/glean-mdm.exe"
    CONFIG_DIR="/c/ProgramData/Glean MDM"
    LOG_FILE="$CONFIG_DIR/glean-mdm.log"
    SCHEDULE_TYPE="schtasks"
    TASK_NAME="Glean MDM"
    SUDO=""
    ;;
  *) echo "FAIL: Unsupported platform"; exit 1 ;;
esac

cleanup() {
  case "$SCHEDULE_TYPE" in
    launchdaemon)
      sudo launchctl bootout system/com.glean.mdm 2>/dev/null || true
      sudo rm -f "$PLIST_FILE"
      ;;
    systemd)
      sudo systemctl disable --now glean-mdm.timer 2>/dev/null || true
      sudo rm -f "$SERVICE_FILE" "$TIMER_FILE"
      sudo systemctl daemon-reload 2>/dev/null || true
      ;;
    schtasks) schtasks //Delete //TN "$TASK_NAME" //F 2>/dev/null || true ;;
  esac
  $SUDO rm -f "$RUN_OUTPUT" "$INSTALL_PATH" "$LOG_FILE"
  $SUDO rm -rf "$CONFIG_DIR"
}

if [ "$SCHEDULE_TYPE" = "systemd" ] && ! systemctl show --property=Version > /dev/null 2>&1; then
  echo "SKIP: systemd is not available"
  rm -f "$RUN_OUTPUT"
  exit 0
fi
trap cleanup EXIT

run_cli() {
  if ! $SUDO "$INSTALL_PATH" "$@" > "$RUN_OUTPUT" 2>&1; then
    cat "$RUN_OUTPUT"
    echo "FAIL: glean-mdm $*"
    exit 1
  fi
}

assert_retained() {
  cmp "$BINARY" "$INSTALL_PATH"
  test "$(cat "$CONFIG_DIR/mcp-config.json")" = "legacy mcp fixture"
  test "$(cat "$CONFIG_DIR/mdm-config.json")" = "legacy mdm fixture"
  grep -q 'retained log fixture' "$LOG_FILE"
}

echo "=== Install binary and intentionally invalid legacy configs ==="
$SUDO mkdir -p "$(dirname "$INSTALL_PATH")" "$CONFIG_DIR"
$SUDO cp "$BINARY" "$INSTALL_PATH"
$SUDO chmod 755 "$INSTALL_PATH"
printf 'legacy mcp fixture\n' | $SUDO tee "$CONFIG_DIR/mcp-config.json" > /dev/null
printf 'legacy mdm fixture\n' | $SUDO tee "$CONFIG_DIR/mdm-config.json" > /dev/null
printf 'retained log fixture\n' | $SUDO tee "$LOG_FILE" > /dev/null

echo "=== Create a legacy schedule directly ==="
create_legacy_schedule
assert_schedule_present

echo "=== install-schedule is a no-op, including when a schedule already exists ==="
run_cli install-schedule
grep -q 'install-schedule is a no-op' "$RUN_OUTPUT"
assert_schedule_present

echo "=== Dry-run preserves the schedule ==="
run_cli run --dry-run --skip-update --user nonexistent --mcp-config /missing/mcp.json --mdm-config /missing/mdm.json
grep -q '\[DRY RUN\]' "$RUN_OUTPUT"
assert_schedule_present
assert_retained

echo "=== run retires only the schedule ==="
run_cli run --skip-update
schedule_is_absent
assert_retained

echo "=== Retirement is idempotent and install-schedule cannot recreate it ==="
run_cli run
run_cli uninstall-schedule
run_cli install-schedule
schedule_is_absent
assert_retained

echo "=== Retirement from the actual scheduled job ==="
create_legacy_schedule
assert_schedule_present
trigger_legacy_schedule
# On macOS the invocation may be terminated by its own bootout. Observe the
# persistent definition AND loaded job, rather than requiring a zero exit code.
for i in $(seq 1 60); do
  if schedule_is_absent; then break; fi
  sleep 1
done
if ! schedule_is_absent; then
  cat "$LOG_FILE"
  echo "FAIL: Scheduled retirement did not remove the schedule within 60 seconds"
  exit 1
fi
assert_retained

echo "PASS: Schedule retirement, scheduled execution, preservation, dry-run, and idempotency"
