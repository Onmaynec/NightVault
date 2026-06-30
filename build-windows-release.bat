@echo off
chcp 65001 > nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title NightVault Full Windows Release Builder

echo =========================================
echo   NightVault Full Windows Release Builder
echo =========================================
echo.

where node >nul 2>nul || (
  echo Node.js not found. Installing Node.js LTS via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  pause
  exit /b 1
)
where npm >nul 2>nul || (
  echo npm not found. Reopen terminal and run again.
  pause
  exit /b 1
)

call npm install || exit /b 1
call npm run verify || exit /b 1
call npm run build:all-win || exit /b 1

echo.
echo Done. See dist\ for setup and portable .exe files.
pause
