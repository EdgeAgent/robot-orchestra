# Robot Orchestra — WSL2 sandbox host setup, v1
# Run on Kevin's Windows PC, in PowerShell as Administrator, once.
# What it does, in order, and nothing else:
#  1. Checks WSL is installed; installs it (default Ubuntu) if missing.
#  2. Checks Ubuntu is present; if not, installs it.
#  3. Prints the next steps: install SPACE inside WSL2, start the voice
#     server on 127.0.0.1:8765, checkout voice-control-v1, run the demo.
# It does NOT touch the main Windows desktop, does NOT open any port
# to the network, and does NOT install anything on the main desktop
# except WSL2 itself. All agent screens stay inside WSL2, loopback only.
# Requires: PowerShell as Administrator. Re-run is safe (checks first).

$ErrorActionPreference = "Stop"

Write-Host "=== Robot Orchestra — WSL2 sandbox host check ===" -ForegroundColor Cyan

$wsl = Get-Command wsl -ErrorAction SilentlyContinue
if (-not $wsl) {
    Write-Host "WSL not found. Installing WSL (this may need a restart)..." -ForegroundColor Yellow
    wsl --install
    Write-Host "WSL installed. Restart Windows, then re-run this script." -ForegroundColor Yellow
    exit 0
}

Write-Host "WSL found. Checking distros..." -ForegroundColor Green
$distros = wsl --list --quiet
if ($distros -notmatch "Ubuntu") {
    Write-Host "Ubuntu not found. Installing Ubuntu in WSL2..." -ForegroundColor Yellow
    wsl --install -d Ubuntu
    Write-Host "Ubuntu installed. Open it once to finish setup, then re-run this script." -ForegroundColor Yellow
    exit 0
}

Write-Host "Ubuntu present. Checking version is WSL2..." -ForegroundColor Green
wsl --list --verbose

Write-Host ""
Write-Host "=== Next steps (inside WSL2 Ubuntu) ===" -ForegroundColor Cyan
Write-Host "1. git checkout voice-control-v1   (in your robot-orchestra repo)"
Write-Host "2. Install SPACE in WSL2, per its own docs, loopback only."
Write-Host "3. Start the local voice server: Moonshine STT + Piper TTS on 127.0.0.1:8765"
Write-Host "4. Run: node apps/desktop/demo-m1.cjs   (rehearsal, no sends)"
Write-Host "5. Run the Electron app on that branch and watch Agent 1 + Agent 2 screens in noVNC:"
Write-Host "   Agent 1: http://127.0.0.1:6081/vnc.html"
Write-Host "   Agent 2: http://127.0.0.1:6082/vnc.html"
Write-Host ""
Write-Host "Sandbox host is ready to check. Live stream proof happens on this PC, not in the cloud." -ForegroundColor Green
