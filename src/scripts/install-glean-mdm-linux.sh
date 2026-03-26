#!/bin/bash
#
# install-glean-mdm-linux.sh
#
# Installs the Glean MDM binary on Linux, configures it,
# and sets up a schedule.
#
# Usage:
#   sudo bash install-glean-mdm-linux.sh

set -euo pipefail

BACKEND_URL="{{BACKEND_URL}}"
BINARY_URL_PREFIX="https://app.glean.com/static/mdm/binaries"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="glean-mdm"

# ── Detect download tool ─────────────────────────────────────────────────────

if command -v curl >/dev/null 2>&1; then
    fetch_url() { curl -fsSL "$1"; }
    download_file() { curl -fsSL -o "$1" "$2"; }
elif command -v wget >/dev/null 2>&1; then
    fetch_url() { wget -qO- "$1"; }
    download_file() { wget -qO "$1" "$2"; }
else
    echo "ERROR: curl or wget is required but neither was found."
    exit 1
fi

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
VERSION_RESPONSE=$(fetch_url "${BACKEND_URL}/api/v1/mdm/version")
VERSION=$(echo "$VERSION_RESPONSE" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
    echo "ERROR: Failed to fetch MDM version from ${BACKEND_URL}/api/v1/mdm/version"
    exit 1
fi

echo "Latest version: $VERSION"

# ── Download binary ───────────────────────────────────────────────────────────

BINARY_URL="${BINARY_URL_PREFIX}/${VERSION}/glean-mdm-linux-${ARCH}"
echo "Downloading from $BINARY_URL..."
download_file "${INSTALL_DIR}/${BINARY_NAME}" "$BINARY_URL"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

echo "Binary installed to ${INSTALL_DIR}/${BINARY_NAME}"

# ── Configure ────────────────────────────────────────────────────────────────

echo "Creating configuration..."
"${INSTALL_DIR}/${BINARY_NAME}" config \
  --server-name "{{SERVER_NAME}}" \
  --server-url "{{SERVER_URL}}" \
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
