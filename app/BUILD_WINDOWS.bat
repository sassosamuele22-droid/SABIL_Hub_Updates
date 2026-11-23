@echo off
setlocal
cd /d "%~dp0"
title SABIL GR Hub v0.5 - Windows Builder
color 0B

echo.
echo ============================================
echo       SABIL GR HUB v0.5 - WINDOWS BUILD
echo ============================================
echo.
echo [1/3] Installing dependencies...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto error

echo.
echo [2/3] Building SABIL GR Hub.exe...
call npx.cmd electron-packager . "SABIL GR Hub" --platform=win32 --arch=x64 --icon=sabil.ico --overwrite --out=dist --prune=true
if errorlevel 1 goto error

echo.
echo [3/3] Done.
echo.
echo Your app is here:
echo dist\SABIL GR Hub-win32-x64\SABIL GR Hub.exe
echo.
start "" "%~dp0dist\SABIL GR Hub-win32-x64"
pause
exit /b 0

:error
echo.
echo BUILD FAILED.
echo Copy the error shown above into ChatGPT and I will fix it.
pause
exit /b 1
