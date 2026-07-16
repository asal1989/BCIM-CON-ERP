@echo off
REM ============================================================
REM  BCIM ESSL Attendance Sync Agent — Continuous Loop Mode
REM  Syncs every 5 minutes automatically (no Task Scheduler needed).
REM
REM  USAGE:
REM    Double-click this file, OR run from command prompt:
REM      run-sync.bat
REM
REM  To run as a background service on startup, add this .bat
REM  to Task Scheduler with trigger: At startup, run once.
REM  (The script loops internally every 5 min — no repeat needed.)
REM ============================================================

cd /d "%~dp0"

if not exist logs mkdir logs
set LOGFILE=logs\sync-%DATE:~-4%-%DATE:~3,2%-%DATE:~0,2%.log

REM ── Check node_modules ─────────────────────────────────────────────────────
if not exist node_modules (
  echo [%TIME%] node_modules missing - running npm install... >> "%LOGFILE%"
  echo [%TIME%] node_modules missing - running npm install...
  npm install >> "%LOGFILE%" 2>&1
  if %ERRORLEVEL% NEQ 0 (
    echo [%TIME%] ERROR: npm install failed >> "%LOGFILE%"
    echo [%TIME%] ERROR: npm install failed
    exit /b 1
  )
  echo [%TIME%] npm install complete >> "%LOGFILE%"
)

REM ── Check config.json ──────────────────────────────────────────────────────
if not exist config.json (
  echo [%TIME%] ERROR: config.json not found. >> "%LOGFILE%"
  echo.
  echo  ERROR: config.json not found!
  echo  Copy config.example.json to config.json and fill in:
  echo    - essl.password  (your SQL Server sa password)
  echo    - erp.api_key    (from ERP: HR Admin - ESSL Sync - Agent Setup)
  echo.
  exit /b 1
)

echo [%DATE% %TIME%] ESSL Agent starting in loop mode... >> "%LOGFILE%"
echo [%DATE% %TIME%] ESSL Agent starting in loop mode...

node sync.js --loop >> "%LOGFILE%" 2>&1

echo [%DATE% %TIME%] ESSL Agent stopped (exit code %ERRORLEVEL%). >> "%LOGFILE%"
pause
