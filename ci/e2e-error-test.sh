#!/bin/bash
set -euo pipefail

BINARY="${1:?Usage: e2e-error-test.sh <binary>}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
RUN_OUTPUT="$WORK_DIR/output.log"

run_preview() {
  local scenario="$1"
  shift
  if ! "$BINARY" run --dry-run "$@" > "$RUN_OUTPUT" 2>&1; then
    cat "$RUN_OUTPUT"
    echo "FAIL [$scenario]: Retirement preview failed"
    exit 1
  fi
  grep -q 'glean-mdm is deprecated' "$RUN_OUTPUT"
  grep -q '\[DRY RUN\] Would remove the legacy Glean MDM schedule' "$RUN_OUTPUT"
  if grep -Eq 'Checking for updates|Configuring hosts|Installing extensions|Update failed' "$RUN_OUTPUT"; then
    cat "$RUN_OUTPUT"
    echo "FAIL [$scenario]: Preview attempted legacy work"
    exit 1
  fi
  echo "PASS [$scenario]"
}

# Retirement must not depend on valid configs or a valid legacy --user value.
run_preview missing-configs --mcp-config "$WORK_DIR/missing-mcp.json" --mdm-config "$WORK_DIR/missing-mdm.json" --user nonexistent
printf 'not json\n' > "$WORK_DIR/mcp.json"
printf 'not json\n' > "$WORK_DIR/mdm.json"
run_preview malformed-configs --mcp-config "$WORK_DIR/mcp.json" --mdm-config "$WORK_DIR/mdm.json"
run_preview updater-reexecution --skip-update --mcp-config "$WORK_DIR/mcp.json" --mdm-config "$WORK_DIR/mdm.json"
test "$(cat "$WORK_DIR/mcp.json")" = 'not json'
test "$(cat "$WORK_DIR/mdm.json")" = 'not json'

echo "PASS: Retirement previews ignore legacy configuration and updater flags"
