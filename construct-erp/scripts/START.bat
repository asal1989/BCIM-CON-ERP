@echo off
title BCIM Engineering — ConstructERP
color 0A
cls
echo.
echo  ====================================================
echo    BCIM Engineering — ConstructERP
echo    Backend  ^>  http://localhost:5000
echo    Frontend ^>  http://localhost:3000
echo  ====================================================
echo.
node "%~dp0scripts\start-all.js"
echo.
echo  Servers stopped.
pause
