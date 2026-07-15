@echo off
cd /d C:\essl-agent
if not exist logs mkdir logs

for /f "tokens=1-3 delims=/ " %%a in ("%DATE%") do set LOGDATE=%%c-%%b-%%a
set LOGFILE=C:\essl-agent\logs\sync-%LOGDATE%.log

echo [%DATE% %TIME%] ---- Sync triggered by Task Scheduler ---- >> "%LOGFILE%"
node C:\essl-agent\sync.js --minutes 30 >> "%LOGFILE%" 2>&1
echo [%DATE% %TIME%] Exit code: %ERRORLEVEL% >> "%LOGFILE%"
