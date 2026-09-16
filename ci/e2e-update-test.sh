#!/bin/bash
set -euo pipefail

OLD_BINARY="${1:?Usage: e2e-update-test.sh <old-binary> <new-binary>}"
NEW_BINARY="${2:?Usage: e2e-update-test.sh <old-binary> <new-binary>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/legacy-schedule-fixture.sh"

PORT_FILE="$(mktemp)"
BINARY_PORT_FILE="$(mktemp)"
CONFIG_DIR="$(mktemp -d)"
RUN_OUTPUT="$(mktemp)"
MOCK_PID=""

# Platform-specific paths matching src/platform.ts
case "$(uname -s)" in
  Linux)
    INSTALL_DIR="/usr/local/bin"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="systemd"
    SERVICE_FILE="/etc/systemd/system/glean-mdm.service"
    TIMER_FILE="/etc/systemd/system/glean-mdm.timer"
    SUDO="sudo"
    ;;
  Darwin)
    INSTALL_DIR="/usr/local/bin"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm"
    LOG_FILE="/var/log/glean-mdm.log"
    SCHEDULE_TYPE="launchdaemon"
    PLIST_FILE="/Library/LaunchDaemons/com.glean.mdm.plist"
    SUDO="sudo"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    INSTALL_DIR="/c/Program Files/Glean"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm.exe"
    LOG_DIR="/c/ProgramData/Glean MDM"
    LOG_FILE="$LOG_DIR/glean-mdm.log"
    SCHEDULE_TYPE="schtasks"
    TASK_NAME="Glean MDM"
    SUDO=""
    ;;
  *)
    echo "FAIL: Unsupported platform: $(uname -s)"
    exit 1
    ;;
esac

cleanup() {
  echo "=== Cleanup ==="
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
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
  rm -f "$PORT_FILE" "$BINARY_PORT_FILE" "$RUN_OUTPUT" "$INSTALL_PATH"
  rm -rf "$CONFIG_DIR"
  # The old updater runs as root/admin and leaves root-owned staging dirs.
  $SUDO rm -rf "$INSTALL_DIR"/.glean-mdm-update-*
  case "$(uname -s)" in
    Linux|Darwin) sudo rm -f "$LOG_FILE" ;;
    *) rm -f "$LOG_FILE" ;;
  esac
}
trap cleanup EXIT

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

echo "=== Install old binary ==="
cp "$OLD_BINARY" "$INSTALL_PATH"
chmod 755 "$INSTALL_PATH"
"$INSTALL_PATH" --version > "$RUN_OUTPUT" 2>&1 || true
OLD_VER=$(tr -d '\r' < "$RUN_OUTPUT")
echo "Old binary version: $OLD_VER"

echo "=== Start mock server ==="
bun "$SCRIPT_DIR/e2e-mock-server.ts" \
  --binary-path "$NEW_BINARY" \
  --version 99.0.0 \
  --port-file "$PORT_FILE" \
  --binary-port-file "$BINARY_PORT_FILE" &
MOCK_PID=$!

# Wait for the port files to be written
for i in $(seq 1 30); do
  if [ -s "$PORT_FILE" ] && [ -s "$BINARY_PORT_FILE" ]; then
    break
  fi
  sleep 0.1
done

if [ ! -s "$PORT_FILE" ] || [ ! -s "$BINARY_PORT_FILE" ]; then
  echo "FAIL: Mock server did not start (no port file after 3s)"
  exit 1
fi

PORT=$(cat "$PORT_FILE")
BINARY_PORT=$(cat "$BINARY_PORT_FILE")
echo "Version server on port $PORT"
echo "Binary server on port $BINARY_PORT"

# Sanity-check the mock server
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/mdm/version")
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: Mock server health check returned $HTTP_CODE"
  exit 1
fi
echo "Mock server health check OK"

echo "=== Generate test configs via config subcommand ==="
# Use the new (PR) binary since the old binary may not have the config subcommand
"$NEW_BINARY" config \
  --server-name e2e_test \
  --server-url "http://127.0.0.1:${PORT}/mcp/default" \
  --auto-update \
  --version-url "http://127.0.0.1:${PORT}/api/v1/mdm/version" \
  --binary-url-prefix "http://127.0.0.1:${BINARY_PORT}/static/mdm/binaries" \
  --output-dir "$CONFIG_DIR"

MCP_CONFIG_FILE="$CONFIG_DIR/mcp-config.json"
MDM_CONFIG_FILE="$CONFIG_DIR/mdm-config.json"

echo "MCP config: $(cat "$MCP_CONFIG_FILE")"
echo "MDM config: $(cat "$MDM_CONFIG_FILE")"

echo "=== Seed a legacy schedule and preserve the configs ==="
create_legacy_schedule
assert_schedule_present
cp "$MCP_CONFIG_FILE" "$CONFIG_DIR/mcp-before.json"
cp "$MDM_CONFIG_FILE" "$CONFIG_DIR/mdm-before.json"

echo "=== Run old binary (updates, then retires under the inherited lock) ==="
$SUDO "$INSTALL_PATH" run --mcp-config "$MCP_CONFIG_FILE" --mdm-config "$MDM_CONFIG_FILE" --user "$(whoami)" > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL: Binary exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  echo "=== Log file ==="
  cat "$LOG_FILE" 2>/dev/null || true
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"
grep -q 'glean-mdm is deprecated' "$RUN_OUTPUT"
if grep -Eq 'Configuring hosts|Installing extensions' "$RUN_OUTPUT"; then
  echo "FAIL: Old updater fell back to legacy provisioning after retirement"
  exit 1
fi
schedule_is_absent
cmp "$MCP_CONFIG_FILE" "$CONFIG_DIR/mcp-before.json"
cmp "$MDM_CONFIG_FILE" "$CONFIG_DIR/mdm-before.json"
test -f "$LOG_FILE"

echo "=== Verify update ==="
"$INSTALL_PATH" --version > "$RUN_OUTPUT" 2>&1 || true
INSTALLED_VERSION=$(tr -d '\r' < "$RUN_OUTPUT")
echo "Installed version: $INSTALLED_VERSION"

if [ "$INSTALLED_VERSION" != "99.0.0" ]; then
  echo "FAIL: Expected version 99.0.0, got $INSTALLED_VERSION"
  echo "=== Log file ==="
  cat "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

echo "=== Run new binary again (should not update) ==="
"$INSTALL_PATH" run --dry-run --mcp-config "$MCP_CONFIG_FILE" --mdm-config "$MDM_CONFIG_FILE" --user "$(whoami)" > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL: Second run exited with code $EXIT_CODE"
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
RUN2_OUTPUT=$(tr -d '\r' < "$RUN_OUTPUT")
echo "$RUN2_OUTPUT"

if ! grep -q 'glean-mdm is deprecated' "$RUN_OUTPUT" || ! grep -q '\[DRY RUN\]' "$RUN_OUTPUT"; then
  echo "FAIL: Expected retirement preview on second run"
  exit 1
fi
if grep -Eq 'Checking for updates|Already up to date|Configuring hosts|Installing extensions' "$RUN_OUTPUT"; then
  echo "FAIL: Retirement release attempted legacy work"
  exit 1
fi
echo "Confirmed: new binary previews retirement without self-updating or provisioning"

echo "PASS: E2E update test succeeded"
