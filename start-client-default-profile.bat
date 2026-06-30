@echo off
setlocal
cd /d "%~dp0"
set "NIGHTVAULT_PROFILE_ID=default"
set "NIGHTVAULT_SINGLE_INSTANCE=0"
npm run client
