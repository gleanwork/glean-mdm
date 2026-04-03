#!/bin/bash
set -euo pipefail

BINARY="${1:?Usage: e2e-uninstall-test.sh <binary>}"

RUN_OUTPUT="$(mktemp)"

# Platform-specific paths matching src/platform.ts and src/scheduler.ts
case "$(uname -s)" in
  Linux)
    INSTALL_DIR="/usr/local/bin"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm"
    CONFIG_DIR="/etc/glean_mdm"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="systemd"
    SERVICE_FILE="/etc/systemd/system/glean-mdm.service"
    TIMER_FILE="/etc/systemd/system/glean-mdm.timer"
    ;;
  Darwin)
    INSTALL_DIR="/usr/local/bin"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm"
    CONFIG_DIR="/Library/Application Support/Glean MDM"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="launchdaemon"
    PLIST_FILE="/Library/LaunchDaemons/com.glean.mdm.plist"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    INSTALL_DIR="/c/Program Files/Glean"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm.exe"
    CONFIG_DIR="/c/ProgramData/Glean MDM"
    LOG_FILE="$CONFIG_DIR/glean-mdm.log"
    SCHEDULE_TYPE="schtasks"
    TASK_NAME="Glean MDM"
    ;;
  *)
    echo "FAIL: Unsupported platform: $(uname -s)"
    exit 1
    ;;
esac

# The binary writes to privileged paths — use sudo on Linux/macOS
case "$(uname -s)" in
  Linux|Darwin) SUDO="sudo" ;;
  *)            SUDO="" ;;
esac

cleanup() {
  echo "=== Cleanup ==="
  # Remove any leftover artifacts in case a test failed partway through
  case "$SCHEDULE_TYPE" in
    launchdaemon)
      sudo launchctl bootout system "${PLIST_FILE}" 2>/dev/null || true
      sudo rm -f "${PLIST_FILE}"
      ;;
    systemd)
      sudo systemctl disable --now glean-mdm.timer 2>/dev/null || true
      sudo rm -f "${SERVICE_FILE}" "${TIMER_FILE}"
      sudo systemctl daemon-reload 2>/dev/null || true
      ;;
    schtasks)
      schtasks //Delete //TN "${TASK_NAME}" //F 2>/dev/null || true
      ;;
  esac

  rm -f "$RUN_OUTPUT" "$INSTALL_PATH"
  $SUDO rm -rf "$CONFIG_DIR" 2>/dev/null || true
  $SUDO rm -f "$LOG_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# Skip if systemd is not available (e.g. container environments)
if [ "${SCHEDULE_TYPE:-}" = "systemd" ]; then
  if ! command -v systemctl > /dev/null 2>&1; then
    echo "SKIP: systemctl not available"
    exit 0
  fi
  if ! systemctl is-system-running > /dev/null 2>&1; then
    echo "SKIP: systemd is not running"
    exit 0
  fi
fi

echo "=== Prepare environment ==="
case "$(uname -s)" in
  Linux|Darwin)
    sudo chown "$(whoami)" "$INSTALL_DIR"
    sudo touch "$LOG_FILE" && sudo chmod 666 "$LOG_FILE"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$CONFIG_DIR"
    touch "$LOG_FILE"
    ;;
esac

echo "=== Install binary ==="
cp "$BINARY" "$INSTALL_PATH"
chmod 755 "$INSTALL_PATH"

# Create config directory and files
$SUDO mkdir -p "$CONFIG_DIR"
echo '{}' | $SUDO tee "$CONFIG_DIR/mcp-config.json" > /dev/null
echo '{}' | $SUDO tee "$CONFIG_DIR/mdm-config.json" > /dev/null

# Write something to the log file so it exists
echo "test log" | $SUDO tee "$LOG_FILE" > /dev/null

# Install the schedule so uninstall has something to remove
$SUDO "$INSTALL_PATH" install-schedule > /dev/null 2>&1

# ---------------------------------------------------------------------------
# Test 1: uninstall removes schedule, config, log, and binary
# ---------------------------------------------------------------------------
echo ""
echo "=== Test 1: uninstall ==="
$SUDO "$INSTALL_PATH" uninstall > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL [uninstall]: Binary exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"

# Verify schedule removed
case "$SCHEDULE_TYPE" in
  launchdaemon)
    if [ -f "$PLIST_FILE" ]; then
      echo "FAIL [plist-removed]: $PLIST_FILE still exists after uninstall"
      exit 1
    fi
    echo "PASS [plist-removed]: Plist file removed"

    if sudo launchctl print system/com.glean.mdm > /dev/null 2>&1; then
      echo "FAIL [daemon-unloaded]: LaunchDaemon still loaded after uninstall"
      exit 1
    fi
    echo "PASS [daemon-unloaded]: LaunchDaemon is unloaded"
    ;;
  systemd)
    if [ -f "$SERVICE_FILE" ]; then
      echo "FAIL [service-removed]: $SERVICE_FILE still exists"
      exit 1
    fi
    echo "PASS [service-removed]: Service file removed"

    if [ -f "$TIMER_FILE" ]; then
      echo "FAIL [timer-removed]: $TIMER_FILE still exists"
      exit 1
    fi
    echo "PASS [timer-removed]: Timer file removed"
    ;;
  schtasks)
    if schtasks //Query //TN "$TASK_NAME" > /dev/null 2>&1; then
      echo "FAIL [task-removed]: Scheduled task still exists"
      exit 1
    fi
    echo "PASS [task-removed]: Scheduled task removed"
    ;;
esac

# Verify config directory removed
if [ -d "$CONFIG_DIR" ]; then
  echo "FAIL [config-removed]: $CONFIG_DIR still exists after uninstall"
  exit 1
fi
echo "PASS [config-removed]: Config directory removed"

# Verify log file removed
if [ -f "$LOG_FILE" ]; then
  echo "FAIL [log-removed]: $LOG_FILE still exists after uninstall"
  exit 1
fi
echo "PASS [log-removed]: Log file removed"

# Verify binary removed (on Windows, the binary is renamed to .old since
# Windows locks running executables — check that the original is gone)
if [ -f "$INSTALL_PATH" ]; then
  echo "FAIL [binary-removed]: $INSTALL_PATH still exists after uninstall"
  exit 1
fi
echo "PASS [binary-removed]: Binary removed"

# Clean up the .old file on Windows so later tests start fresh
rm -f "${INSTALL_PATH}.old" 2>/dev/null || true

# Verify output message
if ! tr -d '\r' < "$RUN_OUTPUT" | grep -q "Uninstall complete"; then
  echo "FAIL [uninstall-output]: Expected 'Uninstall complete' in output"
  exit 1
fi
echo "PASS [uninstall-output]: Output contains expected message"

# ---------------------------------------------------------------------------
# Test 2: uninstall --keep-config preserves config directory
# ---------------------------------------------------------------------------
echo ""
echo "=== Test 2: uninstall --keep-config ==="

# Re-create everything for the second test
cp "$BINARY" "$INSTALL_PATH"
chmod 755 "$INSTALL_PATH"
$SUDO mkdir -p "$CONFIG_DIR"
echo '{}' | $SUDO tee "$CONFIG_DIR/mcp-config.json" > /dev/null
echo '{}' | $SUDO tee "$CONFIG_DIR/mdm-config.json" > /dev/null
echo "test log" | $SUDO tee "$LOG_FILE" > /dev/null
$SUDO "$INSTALL_PATH" install-schedule > /dev/null 2>&1

$SUDO "$INSTALL_PATH" uninstall --keep-config > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL [uninstall-keep-config]: Binary exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"

# Config directory should still exist
if [ ! -d "$CONFIG_DIR" ]; then
  echo "FAIL [config-kept]: $CONFIG_DIR was removed despite --keep-config"
  exit 1
fi
echo "PASS [config-kept]: Config directory preserved with --keep-config"

# Log file should still be removed
if [ -f "$LOG_FILE" ]; then
  echo "FAIL [log-removed-keep-config]: $LOG_FILE still exists"
  exit 1
fi
echo "PASS [log-removed-keep-config]: Log file removed"

# Binary should still be removed
if [ -f "$INSTALL_PATH" ]; then
  echo "FAIL [binary-removed-keep-config]: $INSTALL_PATH still exists"
  exit 1
fi
echo "PASS [binary-removed-keep-config]: Binary removed"

echo ""
echo "PASS: All E2E uninstall tests succeeded"
