#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

VERSION="${MDM_VERSION:-$(git describe --tags --always 2>/dev/null || echo "0.0.0-dev")}"
DIST_DIR="dist"
LDFLAGS="-s -w -X github.com/gleanwork/glean-mdm/internal/version.BuildVersion=${VERSION}"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "Building glean-mdm ${VERSION}..."

# GOOS/GOARCH -> published target name. Go's amd64 maps to the "x64" naming used
# by the version endpoint and the self-updater (platform.GetTargetName).
build_target() {
  local goos="$1" goarch="$2" target="$3"
  local ext=""
  [ "$goos" = "windows" ] && ext=".exe"
  local outname="glean-mdm-${target}${ext}"
  echo "  → ${outname}"
  CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" \
    go build -trimpath -ldflags "$LDFLAGS" -o "${DIST_DIR}/${outname}" ./cmd/glean-mdm
}

build_target darwin  arm64 "darwin-arm64"
build_target darwin  amd64 "darwin-x64"
build_target linux   amd64 "linux-x64"
build_target linux   arm64 "linux-arm64"
build_target windows amd64 "windows-x64"

echo "Generating checksums and version.json..."
cd "$DIST_DIR"

# Build version.json with sha256 checksums for each target.
checksums_json="{"
checksums_json+="\"version\":\"${VERSION}\","
checksums_json+="\"checksums\":{"
first=true
for binary in glean-mdm-*; do
  hash=$(shasum -a 256 "$binary" | cut -d' ' -f1)
  # Extract target name (e.g., "darwin-arm64" from "glean-mdm-darwin-arm64").
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

if command -v python3 > /dev/null 2>&1; then
  echo "$checksums_json" | python3 -m json.tool > version.json
else
  echo "$checksums_json" > version.json
fi
cat version.json

cd ..

echo "Build complete: ${DIST_DIR}/"
