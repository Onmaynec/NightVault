@echo off
chcp 65001 > nul
cd /d "%~dp0"
set NIGHTVAULT_HOST=0.0.0.0
set NIGHTVAULT_PORT=3000
echo NightVault Radmin/LAN server
echo Host: %NIGHTVAULT_HOST%
echo Port: %NIGHTVAULT_PORT%
echo Use from clients: http://YOUR-RADMIN-IP:3000
echo.
call npm run server
pause
