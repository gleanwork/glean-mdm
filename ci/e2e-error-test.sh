#!/bin/bash
set -euo pipefail

BINARY="${1:?Usage: e2e-error-test.sh <binary>}"

PORT_FILE="$(mktemp)"
BINARY_PORT_FILE="$(mktemp)"
MCP_CONFIG_FILE="$(mktemp)"
MDM_CONFIG_FILE="$(mktemp)"
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
  rm -f "$PORT_FILE" "$BINARY_PORT_FILE" "$MCP_CONFIG_FILE" "$MDM_CONFIG_FILE" "$RUN_OUTPUT" "$INSTALL_PATH"
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

echo "=== Install binary ==="
cp "$BINARY" "$INSTALL_PATH"
chmod 755 "$INSTALL_PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

start_mock_server() {
  local version_status="$1"
  local binary_status="$2"

  # Kill previous mock if running
  if [ -n "$MOCK_PID" ]; then
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$MOCK_PID" 2>/dev/null || true
    MOCK_PID=""
  fi

  # Clear port files
  : > "$PORT_FILE"
  : > "$BINARY_PORT_FILE"

  bun "$SCRIPT_DIR/e2e-error-mock-server.ts" \
    --version-status "$version_status" \
    --binary-status "$binary_status" \
    --port-file "$PORT_FILE" \
    --binary-port-file "$BINARY_PORT_FILE" &
  MOCK_PID=$!

  # Wait for port files
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
}

run_and_check() {
  local scenario="$1"
  local expected_pattern="$2"

  local port
  port=$(cat "$PORT_FILE")
  local binary_port
  binary_port=$(cat "$BINARY_PORT_FILE")

  cat > "$MCP_CONFIG_FILE" <<EOF
{"serverName":"e2e_test","url":"http://127.0.0.1:${port}/mcp/default"}
EOF
  cat > "$MDM_CONFIG_FILE" <<EOF
{"autoUpdate":true,"versionUrl":"http://127.0.0.1:${port}/api/v1/mdm/version","binaryUrlPrefix":"http://127.0.0.1:${binary_port}/static/mdm/binaries"}
EOF

  "$INSTALL_PATH" --dry-run --mcp-config "$MCP_CONFIG_FILE" --mdm-config "$MDM_CONFIG_FILE" --user "$(whoami)" > "$RUN_OUTPUT" 2>&1 || {
    EXIT_CODE=$?
    echo "FAIL [$scenario]: Binary exited with code $EXIT_CODE"
    echo "=== Output ==="
    tr -d '\r' < "$RUN_OUTPUT"
    exit 1
  }

  local output
  output=$(tr -d '\r' < "$RUN_OUTPUT")

  if echo "$output" | grep -q "$expected_pattern"; then
    echo "PASS [$scenario]"
  else
    echo "FAIL [$scenario]: Expected pattern '$expected_pattern' not found in output"
    echo "=== Output ==="
    echo "$output"
    exit 1
  fi
}

echo ""
echo "=== Scenario: version-403 ==="
start_mock_server 403 200
run_and_check "version-403" "Update check returned HTTP 403"

echo ""
echo "=== Scenario: version-500 ==="
start_mock_server 500 200
run_and_check "version-500" "Update check returned HTTP 500"

echo ""
echo "=== Scenario: binary-404 ==="
start_mock_server 200 404
run_and_check "binary-404" "Update failed:"

echo ""
echo "=== Scenario: binary-502 ==="
start_mock_server 200 502
run_and_check "binary-502" "Update failed:"

echo ""
echo "PASS: All E2E error handling tests succeeded"
