#Requires -RunAsAdministrator
#
# install-glean-mdm-windows-pinned.ps1
#
# Installs a specific version of the Glean MDM binary on Windows,
# configures it, and sets up a schedule.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-glean-mdm-windows-pinned.ps1

$ErrorActionPreference = "Stop"

$BackendUrl = "{{BACKEND_URL}}"
$BinaryUrlPrefix = "https://app.glean.com/static/mdm/binaries"
$InstallDir = "C:\Program Files\Glean"
$BinaryName = "glean-mdm.exe"

# ── Version ──────────────────────────────────────────────────────────────────

$Version = "{{PINNED_VERSION}}"
Write-Host "Pinned version: $Version"

# ── Download binary ───────────────────────────────────────────────────────────

$BinaryUrl = "$BinaryUrlPrefix/$Version/glean-mdm-windows-x64.exe"
Write-Host "Downloading from $BinaryUrl..."

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri $BinaryUrl -OutFile "$InstallDir\$BinaryName" -UseBasicParsing

Write-Host "Binary installed to $InstallDir\$BinaryName"

# ── Configure ────────────────────────────────────────────────────────────────

Write-Host "Creating configuration..."
& "$InstallDir\\$BinaryName" config `
  --server-name "{{SERVER_NAME}}" `
  --server-url "{{SERVER_URL}}" `
  --no-auto-update `
  --pinned-version "{{PINNED_VERSION}}" `
  --version-url "$BackendUrl/api/v1/mdm/version" `
  --binary-url-prefix "$BinaryUrlPrefix"

# ── Install schedule and run ──────────────────────────────────────────────────

Write-Host "Installing schedule..."
& "$InstallDir\$BinaryName" install-schedule

Write-Host "Running initial configuration..."
& "$InstallDir\$BinaryName" run

Write-Host ""
Write-Host "Glean MDM installed successfully."
