@echo off
:: ============================================================
:: BCIM ERP — Export database from this machine
:: Run this on your CURRENT machine before moving to new server
:: ============================================================

if "%PGPASSWORD%"=="" (
    set /p PGPASSWORD=Enter PostgreSQL password:
)
set PG_BIN=C:\Program Files\PostgreSQL\18\bin

echo Exporting construct_erp database...
"%PG_BIN%\pg_dump.exe" -U postgres -d construct_erp -F c -f "construct_erp_backup.dump"

if %errorlevel% == 0 (
    echo.
    echo SUCCESS! Database exported to: construct_erp_backup.dump
    echo Copy this file to the new server along with the project folder.
) else (
    echo FAILED. Check that PostgreSQL is running and credentials are correct.
)
pause
