@echo off
setlocal
cd /d "%~dp0"
title LOTG Cup Label Printer

REM ============================================================
REM  LOTG Cup Label Printer - one download, then one double-click
REM
REM  Put this file in its own empty folder (e.g. C:\LOTG-Printer)
REM  and double-click it. Each time it runs it:
REM    1. downloads the latest printer software next to itself
REM    2. installs Node.js if it's missing
REM    3. makes sure everything is ready
REM    4. starts printing
REM
REM  The only thing it can't create for you is the .env settings
REM  file (it holds your connection details) - it walks you
REM  through making that the first time.
REM
REM  Want it to start when the PC turns on? Press Win+R, type
REM  shell:startup, and drop a shortcut to this file in there.
REM ============================================================

set "DOWNLOAD_URL=https://github.com/VForev/churchCoffeePay/raw/main/public/print-agent.zip"
set "AGENT_DIR=print-agent"

echo(
echo   LOTG Cup Label Printer
echo   ----------------------
echo(

REM ---- 1. Download / update the printer software --------------------------
where curl >nul 2>nul || goto no_curl
echo   Checking for the latest version...
curl -L -f -s -o "_update.zip" "%DOWNLOAD_URL%"
if errorlevel 1 goto dl_failed
where tar >nul 2>nul || goto no_tar
tar -xf "_update.zip" || goto unpack_failed
del "_update.zip" >nul 2>nul
echo   Up to date.
goto have_files

:dl_failed
if exist "%AGENT_DIR%\agent.ts" (
  echo   Couldn't check for updates - using the copy already on this PC.
  goto have_files
)
echo   Couldn't download the printer software, and none is installed yet.
echo   Please connect this PC to the internet and try again.
goto end_fail

:have_files
if not exist "%AGENT_DIR%\agent.ts" goto unpack_failed
echo(

REM ---- 2. Make sure Node.js is installed ----------------------------------
where node >nul 2>nul && goto have_node
echo   Node.js isn't installed yet (a free, one-time install).
where winget >nul 2>nul || goto node_manual
echo   Installing it for you - this can take a few minutes...
echo(
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo(
echo   Node.js is installed. Please CLOSE this window and double-click
echo   LOTG-Printer again to finish starting up.
goto end_ok

:node_manual
echo     1. The download page is opening in your browser.
echo     2. Install the "LTS" version (click Next through it).
echo     3. Close this window, then double-click LOTG-Printer again.
start "" "https://nodejs.org/en/download"
goto end_ok

:have_node
cd "%AGENT_DIR%"

REM ---- 3. Install the agent's building blocks -----------------------------
echo   Getting everything ready...
call npm install || goto npm_failed
echo(

REM ---- 4. Make sure the settings file exists ------------------------------
if exist ".env" goto run
if exist ".env.example" copy ".env.example" ".env" >nul
echo   ============================================================
echo    ONE-TIME STEP: your connection details
echo   ============================================================
echo   A settings file called  .env  was created for you here:
echo     %CD%
echo(
echo   It's opening in Notepad now. On the website, open
echo     Admin  ^>  Set Up the Cup Printer
echo   copy the settings box shown there into this file, then
echo   Save and close Notepad.
echo(
echo   After you save it, double-click LOTG-Printer again.
echo   ============================================================
start "" notepad ".env"
goto end_ok

REM ---- 5. Start printing --------------------------------------------------
:run
echo   Starting the printer. Leave this window open during service.
echo   Close this window to stop printing.
echo(
call npm start
echo(
echo   The printer has stopped. If that wasn't on purpose, read the message above.
goto end_ok

:no_curl
echo   This PC is missing a tool Windows normally includes (curl).
echo   Please update Windows, or use the manual setup steps on the website.
goto end_fail

:no_tar
echo   This PC is missing a tool Windows normally includes (tar).
echo   Please update Windows, or use the manual setup steps on the website.
goto end_fail

:unpack_failed
echo   Something went wrong unpacking the download. Please try again.
goto end_fail

:npm_failed
echo(
echo   Setup couldn't finish. Check the internet connection and try again.
goto end_fail

:end_fail
echo(
echo   Press any key to close...
pause >nul
exit /b 1

:end_ok
echo(
echo   Press any key to close...
pause >nul
exit /b 0
