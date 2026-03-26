#!/bin/bash
set -euo pipefail

BINARY="${1:?Usage: e2e-config-test.sh <binary>}"

CONFIG_DIR="$(mktemp -d)"
RUN_OUTPUT="$(mktemp)"
CHECKSUMS_RUN1="$(mktemp)"
CHECKSUMS_RUN2="$(mktemp)"

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

CREATED_FILES=()

# Use sha256sum on Windows (Git Bash), shasum elsewhere
if command -v shasum > /dev/null 2>&1; then
  hash_cmd() { shasum -a 256 "$1"; }
else
  hash_cmd() { sha256sum "$1"; }
fi

cleanup() {
  echo "=== Cleanup ==="
  for f in "${CREATED_FILES[@]+"${CREATED_FILES[@]}"}"; do
    rm -f "$f" 2>/dev/null || true
    # Remove parent dirs if empty up to HOME
    local dir
    dir="$(dirname "$f")"
    while [ "$dir" != "$HOME" ] && [ "$dir" != "/" ] && [ ${#dir} -gt ${#HOME} ]; do
      rmdir "$dir" 2>/dev/null || break
      dir="$(dirname "$dir")"
    done
  done

  rm -rf "$CONFIG_DIR"
  rm -f "$RUN_OUTPUT" "$CHECKSUMS_RUN1" "$CHECKSUMS_RUN2" "${UNIQUE_FILES_FILE:-}" "$INSTALL_PATH"
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

echo "=== Generate test configs via config subcommand ==="
"$INSTALL_PATH" config \
  --server-name e2e_config_test \
  --server-url https://example.invalid/mcp/default \
  --no-auto-update \
  --binary-url-prefix https://example.invalid/static/mdm/binaries \
  --output-dir "$CONFIG_DIR"

MCP_CONFIG_FILE="$CONFIG_DIR/mcp-config.json"
MDM_CONFIG_FILE="$CONFIG_DIR/mdm-config.json"

echo "MCP config: $(cat "$MCP_CONFIG_FILE")"
echo "MDM config: $(cat "$MDM_CONFIG_FILE")"

echo ""
echo "=== Re-run config with same server-name (expect skip) ==="
"$INSTALL_PATH" config \
  --server-name e2e_config_test \
  --server-url https://different.invalid/mcp/default \
  --no-auto-update \
  --binary-url-prefix https://example.invalid/static/mdm/binaries \
  --output-dir "$CONFIG_DIR"

MCP_AFTER_SKIP="$(cat "$MCP_CONFIG_FILE")"
echo "MCP config after skip: $MCP_AFTER_SKIP"

if echo "$MCP_AFTER_SKIP" | grep -q "example.invalid/mcp/default"; then
  echo "PASS [skip-preserves-original]: Original server URL preserved"
else
  echo "FAIL [skip-preserves-original]: Original server URL was overwritten"
  exit 1
fi

echo ""
echo "=== Run config with new server-name (expect append) ==="
"$INSTALL_PATH" config \
  --server-name e2e_second_server \
  --server-url https://second.invalid/mcp/default \
  --no-auto-update \
  --binary-url-prefix https://example.invalid/static/mdm/binaries \
  --output-dir "$CONFIG_DIR"

MCP_AFTER_APPEND="$(cat "$MCP_CONFIG_FILE")"
echo "MCP config after append: $MCP_AFTER_APPEND"

ENTRY_COUNT=$(echo "$MCP_AFTER_APPEND" | grep -c '"serverName"')
if [ "$ENTRY_COUNT" -eq 2 ]; then
  echo "PASS [append-new-server]: Two server entries present"
else
  echo "FAIL [append-new-server]: Expected 2 entries, found $ENTRY_COUNT"
  exit 1
fi

echo ""
echo "=== Run 1: Create configs ==="
"$INSTALL_PATH" run --skip-update --mcp-config "$MCP_CONFIG_FILE" --mdm-config "$MDM_CONFIG_FILE" \
  --user "$(whoami)" > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL: Binary exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  echo "=== Log file ==="
  cat "$LOG_FILE" 2>/dev/null || true
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"

echo ""
echo "=== Discover created config files ==="
while IFS= read -r line; do
  CREATED_FILES+=("$line")
done < <(tr -d '\r' < "$RUN_OUTPUT" | grep -E 'Configured (JSON|TOML|YAML): ' | sed 's/.*Configured [A-Z]*: //')

echo "Found ${#CREATED_FILES[@]} configured file(s)"
for f in "${CREATED_FILES[@]}"; do
  echo "  $f"
done

if [ ${#CREATED_FILES[@]} -eq 0 ]; then
  echo "FAIL [config-created]: No config files were created"
  exit 1
fi
echo "PASS [config-created]: ${#CREATED_FILES[@]} config file(s) created"

echo ""
echo "=== Verify config files exist and have content ==="
CONTENT_VERIFIED=false
for f in "${CREATED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "FAIL [file-exists]: File not found: $f"
    exit 1
  fi
  if [ ! -s "$f" ]; then
    echo "FAIL [file-nonempty]: File is empty: $f"
    exit 1
  fi
  if grep -q "example.invalid" "$f" 2>/dev/null; then
    CONTENT_VERIFIED=true
  fi
done
echo "PASS [file-exists]: All config files exist and are non-empty"

if [ "$CONTENT_VERIFIED" = true ]; then
  echo "PASS [content-check]: At least one config file contains expected server URL"
else
  echo "FAIL [content-check]: No config file contains 'example.invalid'"
  echo "=== File contents ==="
  for f in "${CREATED_FILES[@]}"; do
    echo "--- $f ---"
    cat "$f"
  done
  exit 1
fi

echo ""
echo "=== Compute Run 1 checksums ==="
# Deduplicate paths (e.g. cursor and cursor-agent share the same file)
UNIQUE_FILES_FILE="$(mktemp)"
printf '%s\n' "${CREATED_FILES[@]}" | sort -u > "$UNIQUE_FILES_FILE"

while IFS= read -r f; do
  hash_cmd "$f"
done < "$UNIQUE_FILES_FILE" | sort > "$CHECKSUMS_RUN1"
cat "$CHECKSUMS_RUN1"

echo ""
echo "=== Run 2: Verify idempotency ==="
"$INSTALL_PATH" run --skip-update --mcp-config "$MCP_CONFIG_FILE" --mdm-config "$MDM_CONFIG_FILE" \
  --user "$(whoami)" > "$RUN_OUTPUT" 2>&1 || {
  EXIT_CODE=$?
  echo "FAIL: Second run exited with code $EXIT_CODE"
  echo "=== Output ==="
  tr -d '\r' < "$RUN_OUTPUT"
  exit 1
}
tr -d '\r' < "$RUN_OUTPUT"

echo ""
echo "=== Compute Run 2 checksums ==="
while IFS= read -r f; do
  hash_cmd "$f"
done < "$UNIQUE_FILES_FILE" | sort > "$CHECKSUMS_RUN2"
cat "$CHECKSUMS_RUN2"

if diff -q "$CHECKSUMS_RUN1" "$CHECKSUMS_RUN2" > /dev/null 2>&1; then
  echo "PASS [idempotency]: All config files are byte-for-byte identical after second run"
else
  echo "FAIL [idempotency]: Config files changed between runs"
  echo "=== Diff ==="
  diff "$CHECKSUMS_RUN1" "$CHECKSUMS_RUN2" || true
  exit 1
fi

echo ""
echo "PASS: All E2E config creation and idempotency tests succeeded"
