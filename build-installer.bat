@echo off
chcp 65001 > nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title NightVault Installer Builder

echo =========================================
echo   NightVault 1.3.5 Installer Builder
echo =========================================
echo.

echo [1/5] Checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Installing Node.js LTS via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Close this window and run build-installer.bat again if node is still not found.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Restart Windows or reopen terminal, then run this file again.
  pause
  exit /b 1
)

node -v
call npm -v

echo.
echo [2/5] Installing dependencies...
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo [3/5] Running project checks...
call npm run check
if errorlevel 1 (
  echo Project syntax check failed.
  pause
  exit /b 1
)

echo.
echo [4/5] Building NSIS installer...
call npm run build:installer
if errorlevel 1 (
  echo Installer build failed.
  pause
  exit /b 1
)

echo.
echo [5/5] Done.
echo Installer files are in dist\
echo Expected: dist\NightVault-Setup-1.3.5.exe
echo.
echo This installer already includes Electron/Node runtime and app dependencies.
echo Your friends do NOT need to run npm install.
echo.
pause
