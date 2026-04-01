#!/bin/bash
set -euo pipefail

BINARY="${1:?Usage: e2e-schedule-test.sh <binary>}"

RUN_OUTPUT="$(mktemp)"

# Platform-specific paths matching src/scheduler.ts
case "$(uname -s)" in
  Linux)
    INSTALL_DIR="/usr/local/bin"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="systemd"
    SERVICE_FILE="/etc/systemd/system/glean-mdm.service"
    TIMER_FILE="/etc/systemd/system/glean-mdm.timer"
    ;;
  Darwin)
    INSTALL_DIR="/usr/local/bin"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="launchdaemon"
    PLIST_FILE="/Library/LaunchDaemons/com.glean.mdm.plist"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    INSTALL_DIR="/c/Program Files/Glean"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm.exe"
    LOG_DIR="/c/ProgramData/Glean MDM"
    LOG_FILE="$LOG_DIR/glean-mdm.log"
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
  rm -rf "$INSTALL_DIR"/.glean-mdm-update-*
  case "$(uname -s)" in
    Linux|Darwin) sudo rm -f "$LOG_FILE" ;;
    *) rm -f "$LOG_FILE" ;;
  esac
}
trap cleanup EXIT

# Skip if systemd is not available (e.g. container environments)
if [ "$SCHEDULE_TYPE" = "systemd" ]; then
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
    mkdir -p "$LOG_DIR"
    touch "$LOG_FILE"
    ;;
esac

echo "=== Install binary ==="
cp "$BINARY" "$INSTALL_PATH"
chmod 755 "$INSTALL_PATH"

# ---------------------------------------------------------------------------
# Test 1: install-schedule
# ---------------------------------------------------------------------------
echo ""
echo "=== Test 1: install-schedule ==="
$SUDO "$INSTALL_PATH" install-schedule > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL [install-schedule]: Binary exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  echo "=== Log file ==="
  cat "$LOG_FILE" 2>/dev/null || true
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"

# Verify expected log message
case "$SCHEDULE_TYPE" in
  launchdaemon) EXPECTED_INSTALL_MSG="Installed macOS LaunchDaemon schedule" ;;
  systemd)      EXPECTED_INSTALL_MSG="Installed systemd timer schedule" ;;
  schtasks)     EXPECTED_INSTALL_MSG="Installed Windows Task Scheduler schedule" ;;
esac

if ! tr -d '\r' < "$RUN_OUTPUT" | grep -q "$EXPECTED_INSTALL_MSG"; then
  echo "FAIL [install-output]: Expected '$EXPECTED_INSTALL_MSG' in output"
  exit 1
fi
echo "PASS [install-output]: Output contains expected install message"

# Platform-specific artifact assertions
case "$SCHEDULE_TYPE" in
  launchdaemon)
    if [ ! -f "$PLIST_FILE" ]; then
      echo "FAIL [plist-exists]: $PLIST_FILE not found"
      exit 1
    fi
    echo "PASS [plist-exists]: $PLIST_FILE created"

    if ! grep -q "/usr/local/bin/glean-mdm" "$PLIST_FILE"; then
      echo "FAIL [plist-content]: Plist does not reference binary path"
      exit 1
    fi
    echo "PASS [plist-content]: Plist references correct binary path"

    if ! grep -q "com.glean.mdm" "$PLIST_FILE"; then
      echo "FAIL [plist-label]: Plist missing label"
      exit 1
    fi
    echo "PASS [plist-label]: Plist has correct label"

    if ! sudo launchctl print system/com.glean.mdm > /dev/null 2>&1; then
      echo "FAIL [daemon-loaded]: LaunchDaemon not loaded in system domain"
      exit 1
    fi
    echo "PASS [daemon-loaded]: LaunchDaemon is loaded"
    ;;

  systemd)
    if [ ! -f "$SERVICE_FILE" ]; then
      echo "FAIL [service-exists]: $SERVICE_FILE not found"
      exit 1
    fi
    echo "PASS [service-exists]: $SERVICE_FILE created"

    if [ ! -f "$TIMER_FILE" ]; then
      echo "FAIL [timer-exists]: $TIMER_FILE not found"
      exit 1
    fi
    echo "PASS [timer-exists]: $TIMER_FILE created"

    if ! grep -q "/usr/local/bin/glean-mdm" "$SERVICE_FILE"; then
      echo "FAIL [service-content]: Service does not reference binary path"
      exit 1
    fi
    echo "PASS [service-content]: Service references correct binary"

    if ! sudo systemctl is-enabled glean-mdm.timer > /dev/null 2>&1; then
      echo "FAIL [timer-enabled]: glean-mdm.timer is not enabled"
      exit 1
    fi
    echo "PASS [timer-enabled]: glean-mdm.timer is enabled"
    ;;

  schtasks)
    if ! schtasks //Query //TN "$TASK_NAME" > /dev/null 2>&1; then
      echo "FAIL [task-exists]: Scheduled task '$TASK_NAME' not found"
      exit 1
    fi
    echo "PASS [task-exists]: Scheduled task '$TASK_NAME' created"
    ;;
esac

# ---------------------------------------------------------------------------
# Test 2: install-schedule idempotency
# ---------------------------------------------------------------------------
echo ""
echo "=== Test 2: install-schedule idempotency ==="
$SUDO "$INSTALL_PATH" install-schedule > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL [install-idempotent]: Second install exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"
echo "PASS [install-idempotent]: Second install-schedule succeeded without error"

# ---------------------------------------------------------------------------
# Test 3: uninstall-schedule
# ---------------------------------------------------------------------------
echo ""
echo "=== Test 3: uninstall-schedule ==="
$SUDO "$INSTALL_PATH" uninstall-schedule > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL [uninstall-schedule]: Binary exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"

# Verify expected log message
case "$SCHEDULE_TYPE" in
  launchdaemon) EXPECTED_REMOVE_MSG="Removed macOS LaunchDaemon schedule" ;;
  systemd)      EXPECTED_REMOVE_MSG="Removed systemd timer schedule" ;;
  schtasks)     EXPECTED_REMOVE_MSG="Removed Windows Task Scheduler schedule" ;;
esac

if ! tr -d '\r' < "$RUN_OUTPUT" | grep -q "$EXPECTED_REMOVE_MSG"; then
  echo "FAIL [uninstall-output]: Expected '$EXPECTED_REMOVE_MSG' in output"
  exit 1
fi
echo "PASS [uninstall-output]: Output contains expected uninstall message"

# Platform-specific removal assertions
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

    if sudo systemctl is-enabled glean-mdm.timer > /dev/null 2>&1; then
      echo "FAIL [timer-disabled]: Timer is still enabled"
      exit 1
    fi
    echo "PASS [timer-disabled]: Timer is disabled"
    ;;

  schtasks)
    if schtasks //Query //TN "$TASK_NAME" > /dev/null 2>&1; then
      echo "FAIL [task-removed]: Scheduled task still exists"
      exit 1
    fi
    echo "PASS [task-removed]: Scheduled task removed"
    ;;
esac

# ---------------------------------------------------------------------------
# Test 4: uninstall-schedule idempotency
# ---------------------------------------------------------------------------
echo ""
echo "=== Test 4: uninstall-schedule idempotency ==="
$SUDO "$INSTALL_PATH" uninstall-schedule > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL [uninstall-idempotent]: Second uninstall exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"
echo "PASS [uninstall-idempotent]: Second uninstall-schedule succeeded without error"

# Verify removal message is NOT logged when schedule was already gone
if tr -d '\r' < "$RUN_OUTPUT" | grep -q "$EXPECTED_REMOVE_MSG"; then
  echo "FAIL [no-redundant-msg]: '$EXPECTED_REMOVE_MSG' should not appear when schedule already removed"
  exit 1
fi
echo "PASS [no-redundant-msg]: No redundant removal message on idempotent run"

echo ""
echo "PASS: All E2E schedule tests succeeded"
