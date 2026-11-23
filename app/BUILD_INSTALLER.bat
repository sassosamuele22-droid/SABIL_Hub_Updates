@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title SABIL GR Hub - Installer Builder
color 0B

for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "VERSION=%%V"
if not defined VERSION goto version_error

echo.
echo ============================================
echo       SABIL GR HUB v%VERSION% - INSTALLER BUILD
echo ============================================
echo.
echo [1/3] Installing dependencies...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto error

echo.
echo [2/3] Building installer + GitHub update metadata...
call npm.cmd run build:installer
if errorlevel 1 goto error

echo.
echo [3/3] Preparing release files...
if exist "%~dp0UPDATE_UPLOAD" rmdir /s /q "%~dp0UPDATE_UPLOAD"
mkdir "%~dp0UPDATE_UPLOAD"

set "EXE=%~dp0dist\SABIL-GR-Hub-Setup-%VERSION%.exe"
set "BLOCKMAP=%~dp0dist\SABIL-GR-Hub-Setup-%VERSION%.exe.blockmap"
set "YML=%~dp0dist\latest.yml"

if not exist "%EXE%" goto missing
if not exist "%BLOCKMAP%" goto missing
if not exist "%YML%" goto missing

copy /y "%EXE%" "%~dp0UPDATE_UPLOAD\" >nul
copy /y "%BLOCKMAP%" "%~dp0UPDATE_UPLOAD\" >nul
copy /y "%YML%" "%~dp0UPDATE_UPLOAD\" >nul

echo.
echo ============================================
echo BUILD COMPLETE
echo.
echo Installer:
echo   dist\SABIL-GR-Hub-Setup-%VERSION%.exe
echo.
echo GitHub Release files:
echo   UPDATE_UPLOAD\latest.yml
echo   UPDATE_UPLOAD\SABIL-GR-Hub-Setup-%VERSION%.exe
echo   UPDATE_UPLOAD\SABIL-GR-Hub-Setup-%VERSION%.exe.blockmap
echo.
echo To publish automatically, run PUBLISH_UPDATE.bat
echo ============================================
echo.
start "" "%~dp0UPDATE_UPLOAD"
pause
exit /b 0

:missing
echo.
echo BUILD FINISHED, BUT UPDATE FILES ARE MISSING.
echo Expected:
echo   %EXE%
echo   %BLOCKMAP%
echo   %YML%
echo.
echo Send this window to ChatGPT if this happens.
pause
exit /b 1

:version_error
echo Could not read version from package.json.
pause
exit /b 1

:error
echo.
echo BUILD FAILED.
echo Copy the error shown above into ChatGPT.
pause
exit /b 1
