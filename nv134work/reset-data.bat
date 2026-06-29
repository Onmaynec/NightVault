@echo off
set /p CONFIRM=This removes local runtime server data. Type YES: 
if /I not "%CONFIRM%"=="YES" exit /b 1
cd /d "%~dp0"
rmdir /s /q server\runtime 2>nul
echo Runtime data cleared.
pause
