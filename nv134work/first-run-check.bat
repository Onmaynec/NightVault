@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo NightVault 1.3.4 first run diagnostics
node -v
npm -v
call npm run doctor
call npm run sync-audit
pause
