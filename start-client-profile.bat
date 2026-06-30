@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: start-client-profile.bat profile-name
  exit /b 1
)
set "NIGHTVAULT_PROFILE_ID=%~1"
set "NIGHTVAULT_SINGLE_INSTANCE=0"
npm run client
