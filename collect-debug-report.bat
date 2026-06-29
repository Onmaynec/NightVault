@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo NightVault 1.3.4 debug ZIP collector
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установи Node.js LTS и повтори запуск.
  pause
  exit /b 1
)
call npm run debug-report
pause
