@echo off
rem Signs in to Firebase if needed, creates any missing hosting sites, builds,
rem and ships all four. Batch rather than PowerShell on purpose: this machine
rem has script execution disabled, which blocks npm.ps1 and any .ps1 wrapper.
rem
rem Run it from anywhere:  deploy.cmd
setlocal
cd /d "%~dp0"

set "FB=%~dp0node_modules\.bin\firebase.cmd"
if not exist "%FB%" (
  echo No firebase CLI found. Run: npm.cmd install
  exit /b 1
)

echo.
echo == Checking login
call "%FB%" projects:list >nul 2>&1
if errorlevel 1 (
  echo Not signed in. A browser window will open - pick your Google account.
  call "%FB%" login --reauth
  call "%FB%" projects:list >nul 2>&1
  if errorlevel 1 (
    echo Still not signed in - stopping.
    exit /b 1
  )
)
echo Signed in.

echo.
echo == Creating hosting sites
rem "already exists" is the expected outcome on every run after the first.
call "%FB%" hosting:sites:create astral-games1
call "%FB%" hosting:sites:create astral-gateway

echo.
echo == Building
call npm.cmd run build:all
if errorlevel 1 (
  echo Build failed - stopping.
  exit /b 1
)

echo.
echo == Deploying
call "%FB%" deploy --only hosting
if errorlevel 1 (
  echo Deploy failed.
  exit /b 1
)

echo.
echo Live:
echo    https://astral-gateway.web.app   ^(the portal^)
echo    https://astral-games1.web.app    ^(the app^)
