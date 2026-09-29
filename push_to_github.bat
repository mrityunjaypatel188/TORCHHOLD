@echo off
title Push TORCHHOLD to GitHub
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

echo ========================================================
echo   Pushing TORCHHOLD to GitHub
echo   Repository: https://github.com/mrityunjaypatel188/TORCHHOLD
echo ========================================================
echo.

git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   [SUCCESS] Code successfully pushed to GitHub!
    echo   Check it out: https://github.com/mrityunjaypatel188/TORCHHOLD
    echo ========================================================
) else (
    echo ========================================================
    echo   [INFO] If GitHub prompted for login:
    echo   Sign in via the browser popup window or use a
    echo   GitHub Personal Access Token (PAT).
    echo ========================================================
)
echo.
pause
