#!/bin/bash
set -euo pipefail

OLD_BINARY="${1:?Usage: e2e-update-test.sh <old-binary> <new-binary>}"
NEW_BINARY="${2:?Usage: e2e-update-test.sh <old-binary> <new-binary>}"

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
    ;;
  Darwin)
    INSTALL_DIR="/usr/local/bin"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm"
    LOG_FILE="/var/log/glean-mdm.log"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    INSTALL_DIR="/c/Program Files/Glean"
    INSTALL_PATH="$INSTALL_DIR/glean-mdm.exe"
    LOG_DIR="/c/ProgramData/Glean MDM"
    LOG_FILE="$LOG_DIR/glean-mdm.log"
    ;;
  *)
    echo "FAIL: Unsupported platform: $(uname -s)"
    exit 1
    ;;
esac

cleanup() {
  echo "=== Cleanup ==="
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
  rm -f "$PORT_FILE" "$BINARY_PORT_FILE" "$RUN_OUTPUT" "$INSTALL_PATH"
  rm -rf "$CONFIG_DIR"
  rm -rf "$INSTALL_DIR"/.glean-mdm-update-*
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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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

echo "=== Run old binary (triggers update) ==="
"$INSTALL_PATH" --dry-run --mcp-config "$MCP_CONFIG_FILE" --mdm-config "$MDM_CONFIG_FILE" --user "$(whoami)" > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL: Binary exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  echo "=== Log file ==="
  cat "$LOG_FILE" 2>/dev/null || true
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"

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
"$INSTALL_PATH" --dry-run --mcp-config "$MCP_CONFIG_FILE" --mdm-config "$MDM_CONFIG_FILE" --user "$(whoami)" > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL: Second run exited with code $EXIT_CODE"
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
RUN2_OUTPUT=$(tr -d '\r' < "$RUN_OUTPUT")
echo "$RUN2_OUTPUT"

if echo "$RUN2_OUTPUT" | grep -q "Already up to date"; then
  echo "Confirmed: no update on second run"
else
  echo "FAIL: Expected 'Already up to date' in second run output"
  exit 1
fi

echo "PASS: E2E update test succeeded"
