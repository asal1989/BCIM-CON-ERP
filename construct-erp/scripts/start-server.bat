@echo off
:: ============================================================
:: BCIM ERP — Start Server (run after setup-server.bat)
:: Double-click this to start/restart the ERP server
:: ============================================================

:: Get this machine's LAN IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set SERVER_IP=%%a
    goto :found
)
:found
set SERVER_IP=%SERVER_IP: =%

echo ============================================================
echo   BCIM ConstructERP Server
echo   Server IP: %SERVER_IP%
echo ============================================================
echo.

:: Stop existing PM2 instance if running
pm2 stop bcim-erp 2>nul
pm2 delete bcim-erp 2>nul

:: Start backend with PM2
cd /d "%~dp0backend"
pm2 start src/server.js --name bcim-erp --node-args="--max-old-space-size=512"

:: Save PM2 process list (survives reboots)
pm2 save

:: Set up Windows auto-start
pm2-startup install

echo.
echo ============================================================
echo   ERP is running!
echo   Access from any PC on your network:
echo   http://%SERVER_IP%:5000
echo.
echo   To stop: pm2 stop bcim-erp
echo   To view logs: pm2 logs bcim-erp
echo ============================================================
echo.
pm2 status
pause
