@echo off
:: ============================================================
:: BCIM ERP — Server Setup Script
:: Run this on the NEW SERVER after copying the project folder
:: ============================================================

echo ============================================================
echo   BCIM ConstructERP — Server Setup
echo ============================================================
echo.

:: ── Step 1: Check Node.js ──
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install from https://nodejs.org (LTS version)
    pause & exit /b 1
)
echo [OK] Node.js found:
node --version

:: ── Step 2: Check PostgreSQL ──
set PG_BIN=C:\Program Files\PostgreSQL\17\bin
if not exist "%PG_BIN%\psql.exe" (
    set PG_BIN=C:\Program Files\PostgreSQL\16\bin
)
if not exist "%PG_BIN%\psql.exe" (
    set PG_BIN=C:\Program Files\PostgreSQL\15\bin
)
if not exist "%PG_BIN%\psql.exe" (
    echo [ERROR] PostgreSQL not found. Please install from https://www.postgresql.org/download/windows/
    pause & exit /b 1
)
echo [OK] PostgreSQL found at: %PG_BIN%

:: ── Step 3: Install backend dependencies ──
echo.
echo Installing backend dependencies...
cd backend
call npm install --omit=dev
if %errorlevel% neq 0 ( echo [ERROR] Backend npm install failed & pause & exit /b 1 )
echo [OK] Backend dependencies installed

:: ── Step 4: Install frontend dependencies and build ──
echo.
echo Installing frontend dependencies...
cd ..\frontend
call npm install
if %errorlevel% neq 0 ( echo [ERROR] Frontend npm install failed & pause & exit /b 1 )

echo.
echo Building React frontend (this takes 2-3 minutes)...
call npm run build
if %errorlevel% neq 0 ( echo [ERROR] Frontend build failed & pause & exit /b 1 )
echo [OK] Frontend built successfully

:: ── Step 5: Install PM2 ──
cd ..
echo.
echo Installing PM2 (process manager)...
call npm install -g pm2
call npm install -g pm2-windows-startup
echo [OK] PM2 installed

:: ── Step 6: Import database ──
echo.
set /p IMPORT_DB="Do you want to import the database now? (y/n): "
if /i "%IMPORT_DB%"=="y" (
    if "%PGPASSWORD%"=="" (
        set /p PGPASSWORD=Enter PostgreSQL password:
    )
    echo Creating database...
    "%PG_BIN%\psql.exe" -U postgres -c "CREATE DATABASE construct_erp;" 2>nul
    echo Restoring data...
    "%PG_BIN%\pg_restore.exe" -U postgres -d construct_erp -F c construct_erp_backup.dump
    if %errorlevel% == 0 (
        echo [OK] Database restored successfully
    ) else (
        echo [WARN] Database restore had warnings (may be OK if db already had tables)
    )
)

echo.
echo ============================================================
echo   NEXT STEPS:
echo   1. Edit backend\.env  (set SERVER_IP and check DB password)
echo   2. Run: start-server.bat
echo ============================================================
pause
