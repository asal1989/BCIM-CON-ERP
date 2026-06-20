@echo off
:: ============================================================
:: BCIM ERP — Open Windows Firewall port 5000
:: Run as Administrator on the server machine
:: ============================================================
echo Opening port 5000 in Windows Firewall...

netsh advfirewall firewall delete rule name="BCIM ERP Server" >nul 2>&1
netsh advfirewall firewall add rule name="BCIM ERP Server" dir=in action=allow protocol=TCP localport=5000

if %errorlevel% == 0 (
    echo [OK] Firewall rule added. Port 5000 is now open.
    echo Other PCs on your network can access: http://THIS-PC-IP:5000
) else (
    echo [ERROR] Failed. Please run this script as Administrator.
)
pause
