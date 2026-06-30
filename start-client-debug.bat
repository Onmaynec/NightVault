@echo off
cd /d %~dp0
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1
set NIGHTVAULT_DEBUG=1
echo Starting NightVault in debug mode...
call npm run client -- --debug
echo.
echo NightVault debug session ended. Press any key to close this window.
pause >nul
