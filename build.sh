#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

VERSION="${MDM_VERSION:-$(git describe --tags --always 2>/dev/null || echo "0.0.0-dev")}"
DIST_DIR="dist"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "Building glean-mdm-setup ${VERSION}..."

for target in \
  "bun-darwin-arm64" \
  "bun-darwin-x64" \
  "bun-linux-x64" \
  "bun-linux-arm64" \
  "bun-windows-x64"; do

  outname="glean-mdm-setup-${target#bun-}"
  echo "  → ${outname}"

  bun build src/index.ts \
    --compile \
    --target="$target" \
    --define "process.env.BUILD_VERSION=\"$VERSION\"" \
    --outfile "${DIST_DIR}/${outname}"
done

echo "Generating checksums and version.json..."
cd "$DIST_DIR"

# Build version.json with sha256 checksums for each target
checksums_json="{"
checksums_json+="\"version\":\"${VERSION}\","
checksums_json+="\"checksums\":{"
first=true
for binary in glean-mdm-setup-*; do
  hash=$(shasum -a 256 "$binary" | cut -d' ' -f1)
  # Extract target name (e.g., "darwin-arm64" from "glean-mdm-setup-darwin-arm64")
  target_name="${binary#glean-mdm-setup-}"
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

echo "Build complete: ${DIST_DIR}/"
