#!/bin/bash
#
# install-glean-mdm-macos.sh
#
# Installs the Glean MDM binary on macOS, configures it,
# and sets up a schedule.
#
# Usage:
#   sudo bash install-glean-mdm-macos.sh

set -euo pipefail

BACKEND_URL="https://glean-dev-be.glean.com"
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

# ── Fetch version ─────────────────────────────────────────────────────────────

echo "Fetching latest version..."
VERSION_RESPONSE=$(curl -fsSL "${BACKEND_URL}/api/v1/mdm/version")
VERSION=$(echo "$VERSION_RESPONSE" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
    echo "ERROR: Failed to fetch MDM version from ${BACKEND_URL}/api/v1/mdm/version"
    exit 1
fi

echo "Latest version: $VERSION"

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
  --server-name "glean_foo" \
  --server-url "https://glean-dev-be.glean.com/mcp/foo" \
  --auto-update \
  --version-url "${BACKEND_URL}/api/v1/mdm/version" \
  --binary-url-prefix "${BINARY_URL_PREFIX}"

# ── Install schedule and run ──────────────────────────────────────────────────

echo "Installing schedule..."
"${INSTALL_DIR}/${BINARY_NAME}" install-schedule

echo "Running initial configuration..."
"${INSTALL_DIR}/${BINARY_NAME}" run

echo ""
echo "Glean MDM installed successfully."
