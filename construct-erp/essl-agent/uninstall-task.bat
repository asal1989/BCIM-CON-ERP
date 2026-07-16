@echo off
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Please run as administrator.
  pause
  exit /b 1
)

schtasks /delete /tn "BCIM-ESSL-Sync" /f
if %ERRORLEVEL% EQU 0 (
  echo Task "BCIM-ESSL-Sync" removed successfully.
) else (
  echo Task not found or already removed.
)
pause
