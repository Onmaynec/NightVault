@echo off
setlocal
cd /d "%~dp0"
set "NV_TIME=%TIME::=-%"
set "NV_TIME=%NV_TIME: =0%"
set "NIGHTVAULT_PROFILE_ID=client-%RANDOM%-%NV_TIME%"
set "NIGHTVAULT_SINGLE_INSTANCE=0"
npm run client
