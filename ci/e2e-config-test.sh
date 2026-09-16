#!/bin/bash
set -euo pipefail

BINARY="${1:?Usage: e2e-config-test.sh <binary>}"
WORK_DIR="$(mktemp -d)"
CONFIG_DIR="$WORK_DIR/config with spaces"
RUN_OUTPUT="$WORK_DIR/output.log"
trap 'rm -rf "$WORK_DIR"' EXIT

# This release keeps the config command for script compatibility, but run no
# longer provisions client configs. Test only config generation here; schedule
# retirement and preservation are covered by e2e-schedule-test.sh.
run_config() {
  if ! "$BINARY" config \
    --server-name "$1" \
    --server-url "$2" \
    --no-auto-update \
    --binary-url-prefix https://example.invalid/static/mdm/binaries \
    --output-dir "$CONFIG_DIR" > "$RUN_OUTPUT" 2>&1; then
    cat "$RUN_OUTPUT"
    echo "FAIL: config command failed"
    exit 1
  fi
}

MCP_CONFIG_FILE="$CONFIG_DIR/mcp-config.json"
MDM_CONFIG_FILE="$CONFIG_DIR/mdm-config.json"

echo "=== Generate legacy config files ==="
run_config e2e_config_test https://example.invalid/mcp/default
bun - "$MCP_CONFIG_FILE" "$MDM_CONFIG_FILE" <<'JS'
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const [mcpPath, mdmPath] = process.argv.slice(2)
assert.deepEqual(JSON.parse(readFileSync(mcpPath, 'utf8')), [
  { serverName: 'e2e_config_test', url: 'https://example.invalid/mcp/default' },
])
assert.deepEqual(JSON.parse(readFileSync(mdmPath, 'utf8')), {
  autoUpdate: false,
  binaryUrlPrefix: 'https://example.invalid/static/mdm/binaries',
})
JS
cp "$MCP_CONFIG_FILE" "$WORK_DIR/mcp-original.json"
cp "$MDM_CONFIG_FILE" "$WORK_DIR/mdm-original.json"
echo "PASS [config-generation]: Both files contain the expected configuration"

echo "=== Existing server-name preserves the original URL ==="
run_config e2e_config_test https://different.invalid/mcp/default
cmp "$MCP_CONFIG_FILE" "$WORK_DIR/mcp-original.json"
cmp "$MDM_CONFIG_FILE" "$WORK_DIR/mdm-original.json"
echo "PASS [skip-preserves-original]: Existing configuration is unchanged"

echo "=== New server-name appends an entry ==="
run_config e2e_second_server https://second.invalid/mcp/default
bun - "$MCP_CONFIG_FILE" <<'JS'
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
assert.deepEqual(JSON.parse(readFileSync(process.argv[2], 'utf8')), [
  { serverName: 'e2e_config_test', url: 'https://example.invalid/mcp/default' },
  { serverName: 'e2e_second_server', url: 'https://second.invalid/mcp/default' },
])
JS
cmp "$MDM_CONFIG_FILE" "$WORK_DIR/mdm-original.json"
cp "$MCP_CONFIG_FILE" "$WORK_DIR/mcp-appended.json"
echo "PASS [append-new-server]: Both server entries are present"

echo "=== Repeated generation is idempotent ==="
run_config e2e_second_server https://second.invalid/mcp/default
cmp "$MCP_CONFIG_FILE" "$WORK_DIR/mcp-appended.json"
cmp "$MDM_CONFIG_FILE" "$WORK_DIR/mdm-original.json"
echo "PASS [idempotency]: Both config files are byte-for-byte identical"

echo "PASS: Legacy config generation, preservation, append, and idempotency"
