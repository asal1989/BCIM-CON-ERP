@echo off
REM ============================================================
REM  BCIM ESSL Agent — Task Scheduler Installer
REM  Run this ONCE as Administrator to register the scheduled task.
REM  The task will run sync.js every 5 minutes, starting at 00:00,
REM  repeating indefinitely every day.
REM ============================================================

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Please right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)

set TASK_NAME=BCIM-ESSL-Sync
set AGENT_DIR=C:\essl-agent
set NODE_EXE=node
set SCRIPT=%AGENT_DIR%\sync.js

echo.
echo Installing Task Scheduler task: %TASK_NAME%
echo Agent folder : %AGENT_DIR%
echo Script       : %SCRIPT%
echo Interval     : Every 5 minutes
echo.

REM ── Remove existing task if present ───────────────────────────────────────
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

REM ── Create the task ────────────────────────────────────────────────────────
REM  Trigger: daily at 00:00, repeat every 5 minutes for 24 hours, indefinitely
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%NODE_EXE%\" \"%SCRIPT%\" --minutes 10" ^
  /sc MINUTE ^
  /mo 5 ^
  /st 00:00 ^
  /du 9999:59 ^
  /ri 5 ^
  /rl HIGHEST ^
  /ru SYSTEM ^
  /f

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo ERROR: Failed to create task. Check the details above.
  pause
  exit /b 1
)

echo.
echo ✓ Task "%TASK_NAME%" created successfully.
echo.
echo   To verify : schtasks /query /tn "%TASK_NAME%" /fo LIST
echo   To run now: schtasks /run /tn "%TASK_NAME%"
echo   To remove : schtasks /delete /tn "%TASK_NAME%" /f
echo.

REM ── Run immediately to test ────────────────────────────────────────────────
set /p RUN_NOW=Run the sync now to test? (Y/N):
if /i "%RUN_NOW%"=="Y" (
  echo.
  echo Running sync...
  cd /d "%AGENT_DIR%"
  node "%SCRIPT%" --minutes 10
  echo.
  echo Done. Check output above for errors.
)

pause
