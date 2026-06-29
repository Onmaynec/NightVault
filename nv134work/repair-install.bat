@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo NightVault 1.3.4 repair install
rmdir /s /q node_modules 2>nul
del /f /q package-lock.json 2>nul
call npm cache clean --force
call npm install
call npm run verify
pause
