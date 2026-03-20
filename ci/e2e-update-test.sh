#!/bin/bash
set -euo pipefail

OLD_BINARY="${1:?Usage: e2e-update-test.sh <old-binary> <new-binary>}"
NEW_BINARY="${2:?Usage: e2e-update-test.sh <old-binary> <new-binary>}"

INSTALL_PATH="/usr/local/bin/glean-mdm"
LOG_FILE="/var/log/glean-mdm.log"
PORT_FILE="$(mktemp)"
CONFIG_FILE="$(mktemp)"
MOCK_PID=""

cleanup() {
  echo "=== Cleanup ==="
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
  rm -f "$PORT_FILE" "$CONFIG_FILE" "$INSTALL_PATH"
  sudo rm -f "$LOG_FILE"
  rm -rf /usr/local/bin/.glean-mdm-update-*
}
trap cleanup EXIT

echo "=== Prepare environment ==="
sudo chown "$(whoami)" /usr/local/bin
sudo touch "$LOG_FILE" && sudo chmod 666 "$LOG_FILE"

echo "=== Install old binary ==="
cp "$OLD_BINARY" "$INSTALL_PATH"
chmod 755 "$INSTALL_PATH"
echo "Old binary version: $("$INSTALL_PATH" --version)"

echo "=== Start mock server ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bun "$SCRIPT_DIR/e2e-mock-server.ts" \
  --binary-path "$NEW_BINARY" \
  --version 99.0.0 \
  --port-file "$PORT_FILE" &
MOCK_PID=$!

# Wait for the port file to be written
for i in $(seq 1 30); do
  if [ -s "$PORT_FILE" ]; then
    break
  fi
  sleep 0.1
done

if [ ! -s "$PORT_FILE" ]; then
  echo "FAIL: Mock server did not start (no port file after 3s)"
  exit 1
fi

PORT=$(cat "$PORT_FILE")
echo "Mock server on port $PORT"

# Sanity-check the mock server
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/mdm/version")
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: Mock server health check returned $HTTP_CODE"
  exit 1
fi
echo "Mock server health check OK"

echo "=== Create test config ==="
cat > "$CONFIG_FILE" <<EOF
{"serverName":"e2e_test","url":"http://127.0.0.1:${PORT}/mcp/default"}
EOF
echo "Config: $(cat "$CONFIG_FILE")"

echo "=== Run old binary (triggers update) ==="
timeout 60 "$INSTALL_PATH" --dry-run --config "$CONFIG_FILE" --user "$(whoami)" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL: Binary exited with code $EXIT_CODE"
  echo "=== Log file ==="
  cat "$LOG_FILE" 2>/dev/null || true
  exit 1
}

echo "=== Verify update ==="
INSTALLED_VERSION=$("$INSTALL_PATH" --version)
echo "Installed version: $INSTALLED_VERSION"

if [ "$INSTALLED_VERSION" != "99.0.0" ]; then
  echo "FAIL: Expected version 99.0.0, got $INSTALLED_VERSION"
  exit 1
fi

echo "=== Run new binary again (should not update) ==="
RUN2_OUTPUT=$(timeout 60 "$INSTALL_PATH" --dry-run --config "$CONFIG_FILE" --user "$(whoami)" 2>&1) || {
  EXIT_CODE=$?
  echo "FAIL: Second run exited with code $EXIT_CODE"
  echo "$RUN2_OUTPUT"
  exit 1
}
echo "$RUN2_OUTPUT"

if echo "$RUN2_OUTPUT" | grep -q "Already up to date"; then
  echo "Confirmed: no update on second run"
else
  echo "FAIL: Expected 'Already up to date' in second run output"
  exit 1
fi

echo "PASS: E2E update test succeeded"
