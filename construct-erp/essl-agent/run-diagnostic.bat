@echo off
REM ============================================================
REM  BCIM ESSL Attendance Sync Agent — Diagnostic Run
REM  One-shot sync of the last 60 minutes, with full table/response
REM  diagnostics printed to the console AND saved to a log file.
REM
REM  USAGE: Double-click this file, or run from command prompt:
REM    run-diagnostic.bat
REM
REM  Send the resulting output (or the log file it prints at the
REM  end) back for troubleshooting if sync isn't working.
REM ============================================================

cd /d "%~dp0"

if not exist logs mkdir logs
set LOGFILE=logs\diagnostic-%DATE:~-4%-%DATE:~3,2%-%DATE:~0,2%.log

if not exist node_modules (
  echo [%TIME%] node_modules missing - running npm install...
  npm install
  if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
  )
)

if not exist config.json (
  echo.
  echo  ERROR: config.json not found!
  echo  Copy config.example.json to config.json and fill in:
  echo    - essl.password  ^(your SQL Server sa password^)
  echo    - erp.api_key    ^(from ERP: HR Admin - ESSL Sync - Agent Setup^)
  echo.
  pause
  exit /b 1
)

echo ============================================================
echo  Running diagnostic sync (last 60 minutes)...
echo  Output is being saved to: %LOGFILE%
echo ============================================================
echo.

node sync.js --minutes 60 > "%LOGFILE%" 2>&1
type "%LOGFILE%"

echo.
echo ============================================================
echo  Done. Full output saved to: %CD%\%LOGFILE%
echo  Send that file's contents back for troubleshooting.
echo ============================================================
pause
