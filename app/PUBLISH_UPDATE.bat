@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title SABIL GR Hub - Publish GitHub Update
color 0A

for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "VERSION=%%V"
if not defined VERSION goto version_error

set "REPO=sassosamuele22-droid/SABIL_Hub_Updates"
set "TAG=v%VERSION%"

echo.
echo ============================================
echo   SABIL GR HUB %TAG% - GITHUB UPDATE PUBLISHER
echo ============================================
echo.

where gh >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI is not installed.
  echo.
  echo Installing GitHub CLI with winget...
  where winget >nul 2>nul
  if errorlevel 1 goto no_gh
  winget install --id GitHub.cli -e --source winget
  if errorlevel 1 goto no_gh
  echo.
  echo GitHub CLI was installed. Close this window, open it again and run PUBLISH_UPDATE.bat.
  pause
  exit /b 0
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo GitHub needs to be connected once on this PC.
  echo A browser login will open now.
  gh auth login --hostname github.com --web
  if errorlevel 1 goto error
)

if not exist "dist\SABIL-GR-Hub-Setup-%VERSION%.exe" (
  echo Installer not found. Building first...
  call BUILD_INSTALLER.bat
  if errorlevel 1 goto error
)

if not exist "dist\latest.yml" goto missing
if not exist "dist\SABIL-GR-Hub-Setup-%VERSION%.exe.blockmap" goto missing

echo.
echo Publishing %TAG% to %REPO%...

gh release view "%TAG%" --repo "%REPO%" >nul 2>nul
if errorlevel 1 (
  gh release create "%TAG%" ^
    "dist\SABIL-GR-Hub-Setup-%VERSION%.exe" ^
    "dist\SABIL-GR-Hub-Setup-%VERSION%.exe.blockmap" ^
    "dist\latest.yml" ^
    --repo "%REPO%" ^
    --title "SABIL GR Hub v%VERSION%" ^
    --notes "SABIL GR Hub v%VERSION% update release." ^
    --latest
) else (
  echo Release already exists - replacing release assets...
  gh release upload "%TAG%" ^
    "dist\SABIL-GR-Hub-Setup-%VERSION%.exe" ^
    "dist\SABIL-GR-Hub-Setup-%VERSION%.exe.blockmap" ^
    "dist\latest.yml" ^
    --repo "%REPO%" --clobber
)
if errorlevel 1 goto error

echo.
echo ============================================
echo PUBLISHED SUCCESSFULLY
echo %TAG% is now live on GitHub Releases.
echo Installed SABIL GR Hub versions using the GitHub updater can now find it.
echo ============================================
echo.
gh release view "%TAG%" --repo "%REPO%" --web
pause
exit /b 0

:missing
echo Missing release files in dist. Run BUILD_INSTALLER.bat first.
pause
exit /b 1

:version_error
echo Could not read version from package.json.
pause
exit /b 1

:no_gh
echo Could not install GitHub CLI automatically.
echo Install GitHub CLI from https://cli.github.com/ and run this file again.
pause
exit /b 1

:error
echo.
echo PUBLISH FAILED.
echo Copy the error shown above into ChatGPT.
pause
exit /b 1
