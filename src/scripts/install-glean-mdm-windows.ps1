#Requires -RunAsAdministrator
#
# install-glean-mdm-windows.ps1
#
# Installs the Glean MDM binary on Windows, configures it,
# and sets up a schedule.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-glean-mdm-windows.ps1

$ErrorActionPreference = "Stop"

$BackendUrl = "https://glean-dev-be.glean.com"
$BinaryUrlPrefix = "https://app.glean.com/static/mdm/binaries"
$InstallDir = "C:\Program Files\Glean"
$BinaryName = "glean-mdm.exe"

# ── Fetch version ─────────────────────────────────────────────────────────────

Write-Host "Fetching latest version..."
$VersionResponse = Invoke-WebRequest -Uri "$BackendUrl/api/v1/mdm/version" -UseBasicParsing
$VersionJson = $VersionResponse.Content | ConvertFrom-Json
$Version = $VersionJson.version

if (-not $Version) {
    Write-Error "Failed to fetch MDM version from $BackendUrl/api/v1/mdm/version"
    exit 1
}

Write-Host "Latest version: $Version"

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
  --server-name "glean_foo" `
  --server-url "https://glean-dev-be.glean.com/mcp/foo" `
  --auto-update `
  --version-url "$BackendUrl/api/v1/mdm/version" `
  --binary-url-prefix "$BinaryUrlPrefix"

# ── Install schedule and run ──────────────────────────────────────────────────

Write-Host "Installing schedule..."
& "$InstallDir\$BinaryName" install-schedule

Write-Host "Running initial configuration..."
& "$InstallDir\$BinaryName" run

Write-Host ""
Write-Host "Glean MDM installed successfully."
