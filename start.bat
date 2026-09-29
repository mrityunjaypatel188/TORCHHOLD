@echo off
title Touch & Hold Flashlight Dev Server
cd /d "%~dp0"

echo ===================================================
echo   Touch & Hold Flashlight - Starting Dev Server
echo ===================================================

if not exist ".venv\Scripts\python.exe" (
    echo [*] Creating virtual environment .venv...
    python -m venv .venv
    echo [*] Installing requirements...
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
)

echo [*] Launching server...
echo     Tip: Run "start.bat --https" for secure mobile testing!
echo.

.\.venv\Scripts\python.exe server.py %*

pause
