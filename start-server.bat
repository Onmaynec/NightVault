@echo off
chcp 65001 > nul
cd /d "%~dp0"
set NIGHTVAULT_HOST=127.0.0.1
set NIGHTVAULT_PORT=3000
call npm run server
pause
