#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

VERSION="${MDM_VERSION:-$(git describe --tags --always 2>/dev/null || echo "0.0.0-dev")}"
DIST_DIR="dist"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "Building glean-mdm ${VERSION}..."

for target in \
  "bun-darwin-arm64" \
  "bun-darwin-x64" \
  "bun-linux-x64" \
  "bun-linux-arm64" \
  "bun-windows-x64"; do

  outname="glean-mdm-${target#bun-}"
  echo "  → ${outname}"

  bun build src/index.ts \
    --compile \
    --target="$target" \
    --define "process.env.BUILD_VERSION=\"$VERSION\"" \
    --outfile "${DIST_DIR}/${outname}"
done

if command -v codesign >/dev/null 2>&1; then
  echo "Signing macOS binaries..."
  for binary in \
    "${DIST_DIR}/glean-mdm-darwin-arm64" \
    "${DIST_DIR}/glean-mdm-darwin-x64"; do
    codesign --remove-signature "$binary" >/dev/null 2>&1 || true
    codesign --force --sign - "$binary"
    codesign --verify --strict --verbose=4 "$binary"
  done
elif [ "${REQUIRE_DARWIN_CODESIGN:-0}" = "1" ]; then
  echo "ERROR: codesign is required to build release artifacts" >&2
  exit 1
else
  echo "Skipping macOS code signing because codesign is unavailable"
fi

echo "Generating checksums and version.json..."
cd "$DIST_DIR"

# Build version.json with sha256 checksums for each target
checksums_json="{"
checksums_json+="\"version\":\"${VERSION}\","
checksums_json+="\"checksums\":{"
first=true
for binary in glean-mdm-*; do
  hash=$(shasum -a 256 "$binary" | cut -d' ' -f1)
  # Extract target name (e.g., "darwin-arm64" from "glean-mdm-darwin-arm64")
  target_name="${binary#glean-mdm-}"
  target_name="${target_name%.exe}"
  if [ "$first" = true ]; then
    first=false
  else
    checksums_json+=","
  fi
  checksums_json+="\"${target_name}\":\"sha256:${hash}\""
done
checksums_json+="}}"

echo "$checksums_json" | python3 -m json.tool > version.json
cat version.json

cd ..

echo "Build complete: ${DIST_DIR}/"
