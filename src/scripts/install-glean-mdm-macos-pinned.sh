#!/bin/bash
#
# install-glean-mdm-macos-pinned.sh
#
# Installs a specific version of the Glean MDM binary on macOS,
# configures it, and sets up a schedule.
#
# Usage:
#   sudo bash install-glean-mdm-macos-pinned.sh

set -euo pipefail

BACKEND_URL="{{BACKEND_URL}}"
BINARY_URL_PREFIX="https://app.glean.com/static/mdm/binaries"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="glean-mdm"

# ── Detect architecture ──────────────────────────────────────────────────────

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)       ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) echo "ERROR: Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Detected architecture: $ARCH"

# ── Version ──────────────────────────────────────────────────────────────────

VERSION="{{PINNED_VERSION}}"
echo "Pinned version: $VERSION"

# ── Download binary ───────────────────────────────────────────────────────────

BINARY_URL="${BINARY_URL_PREFIX}/${VERSION}/glean-mdm-darwin-${ARCH}"
echo "Downloading from $BINARY_URL..."
curl -fsSL -o "${INSTALL_DIR}/${BINARY_NAME}" "$BINARY_URL"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
xattr -d com.apple.quarantine "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || true

echo "Binary installed to ${INSTALL_DIR}/${BINARY_NAME}"

# ── Configure ────────────────────────────────────────────────────────────────

echo "Creating configuration..."
"${INSTALL_DIR}/${BINARY_NAME}" config \
  --server-name "{{SERVER_NAME}}" \
  --server-url "{{SERVER_URL}}" \
  --no-auto-update \
  --pinned-version "{{PINNED_VERSION}}" \
  --version-url "${BACKEND_URL}/api/v1/mdm/version" \
  --binary-url-prefix "${BINARY_URL_PREFIX}"

# ── Install schedule and run ──────────────────────────────────────────────────

echo "Installing schedule..."
"${INSTALL_DIR}/${BINARY_NAME}" install-schedule

echo "Running initial configuration..."
"${INSTALL_DIR}/${BINARY_NAME}" run

echo ""
echo "Glean MDM installed successfully."
