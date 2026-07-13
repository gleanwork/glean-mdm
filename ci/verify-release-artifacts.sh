#!/bin/bash
set -euo pipefail

DIST_DIR="${1:?Usage: verify-release-artifacts.sh <dist-dir> <expected-version>}"
EXPECTED_VERSION="${2:?Usage: verify-release-artifacts.sh <dist-dir> <expected-version>}"
DIST_DIR="$(cd "$DIST_DIR" && pwd)"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "FAIL: Release artifact verification requires macOS"
  exit 1
fi

verify_darwin_binary() {
  local target="$1"
  local expected_arch="$2"
  local binary="${DIST_DIR}/glean-mdm-${target}"
  local actual_arch

  if [ ! -f "$binary" ]; then
    echo "FAIL: Missing release artifact: $binary"
    exit 1
  fi

  actual_arch="$(lipo -archs "$binary")"
  if [ "$actual_arch" != "$expected_arch" ]; then
    echo "FAIL: Expected $binary to be $expected_arch, got $actual_arch"
    exit 1
  fi

  codesign --verify --strict --verbose=4 "$binary"
}

verify_version() {
  local binary="$1"
  shift
  local actual_version

  actual_version="$("$@" "$binary" --version)"
  if [ "$actual_version" != "$EXPECTED_VERSION" ]; then
    echo "FAIL: Expected $binary --version to return $EXPECTED_VERSION, got $actual_version"
    exit 1
  fi
}

verify_darwin_binary "darwin-arm64" "arm64"
verify_darwin_binary "darwin-x64" "x86_64"

case "$(uname -m)" in
  arm64)
    verify_version "${DIST_DIR}/glean-mdm-darwin-arm64"
    if arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
      rosetta_work_dir="$(mktemp -d)"
      (
        trap 'rm -rf "$rosetta_work_dir"' EXIT
        cd "$rosetta_work_dir"
        verify_version "${DIST_DIR}/glean-mdm-darwin-x64" arch -x86_64
      )
    else
      echo "Skipping darwin-x64 execution because Rosetta is unavailable"
    fi
    ;;
  x86_64)
    verify_version "${DIST_DIR}/glean-mdm-darwin-x64"
    ;;
  *)
    echo "FAIL: Unsupported macOS architecture: $(uname -m)"
    exit 1
    ;;
esac

python3 - "$DIST_DIR" "$EXPECTED_VERSION" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

dist_dir = Path(sys.argv[1])
expected_version = sys.argv[2]
version_path = dist_dir / "version.json"

with version_path.open() as version_file:
    version_info = json.load(version_file)

if version_info.get("version") != expected_version:
    raise SystemExit(
        f"FAIL: Expected version.json version {expected_version}, "
        f"got {version_info.get('version')}"
    )

artifacts = {
    "darwin-arm64": "glean-mdm-darwin-arm64",
    "darwin-x64": "glean-mdm-darwin-x64",
    "linux-arm64": "glean-mdm-linux-arm64",
    "linux-x64": "glean-mdm-linux-x64",
    "windows-x64": "glean-mdm-windows-x64.exe",
}
checksums = version_info.get("checksums", {})

if set(checksums) != set(artifacts):
    raise SystemExit(
        f"FAIL: Expected checksum targets {sorted(artifacts)}, got {sorted(checksums)}"
    )

for target, filename in artifacts.items():
    artifact_path = dist_dir / filename
    if not artifact_path.is_file():
        raise SystemExit(f"FAIL: Missing release artifact: {artifact_path}")

    expected_checksum = checksums[target]
    if not expected_checksum.startswith("sha256:"):
        raise SystemExit(f"FAIL: Invalid checksum for {target}: {expected_checksum}")

    actual_checksum = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    if expected_checksum != f"sha256:{actual_checksum}":
        raise SystemExit(
            f"FAIL: Checksum mismatch for {target}: "
            f"expected {expected_checksum}, got sha256:{actual_checksum}"
        )

print("Release artifact checksums verified")
PY

echo "PASS: Release artifacts verified"
