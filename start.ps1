# PowerShell launcher for Touch & Hold Flashlight Dev Server
param (
    [switch]$Https,
    [int]$Port = 8000
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Touch & Hold Flashlight - Starting Dev Server" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    Write-Host "[*] Setting up virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
    & .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}

$cmdArgs = @("server.py", "--port", "$Port")
if ($Https) {
    $cmdArgs += "--https"
}

& .\.venv\Scripts\python.exe @cmdArgs
