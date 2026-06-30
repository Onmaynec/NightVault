@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
echo [NightVault 1.4.2 Windows Smoke Test]
call npm install || exit /b 1
call npm run verify || exit /b 1
call npm run release:preflight || exit /b 1
echo {"version":"1.4.2","status":"ok","time":"%DATE% %TIME%"} > smoke-report.json
echo Smoke test OK. Report: smoke-report.json
pause
