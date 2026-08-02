@echo off
setlocal
cd /d "%~dp0"
title LOTG Cup Label Printer

REM ============================================================
REM  LOTG Cup Label Printer - one-click start
REM
REM  The first time you run this, it sets itself up.
REM  After that, just double-click it each service morning.
REM
REM  Want it to start when the PC turns on? Put a shortcut to
REM  this file in the Startup folder: press Win+R, type
REM  shell:startup, and drop a shortcut in the folder that opens.
REM ============================================================

echo.
echo   LOTG Cup Label Printer
echo   ----------------------
echo.

REM --- 1. Is Node.js installed? --------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js isn't installed on this computer yet.
  echo   It's a free, one-time install.
  echo.
  echo     1. The download page will open in your browser.
  echo     2. Get the "LTS" Windows Installer and run it ^(click Next through it^).
  echo     3. Close this window, then double-click Start-Printer again.
  echo.
  start "" "https://nodejs.org/en/download"
  echo   Press any key to close this window...
  pause >nul
  exit /b 0
)

REM --- 2. First run: install the printer software --------------------------
if not exist "node_modules\" (
  echo   First-time setup: installing the printer software...
  echo   This takes a minute or two. You'll only see this once.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Setup couldn't finish. Check the internet connection and try again.
    echo   Press any key to close...
    pause >nul
    exit /b 1
  )
  echo.
)

REM --- 3. First run: create the settings file ------------------------------
if not exist ".env" (
  if exist ".env.example" copy ".env.example" ".env" >nul
  echo   One more thing before we can print: your connection details.
  echo   A Notepad window is opening with the settings file.
  echo.
  echo     - Paste the details from the "Set Up the Cup Printer" page
  echo       in the admin panel, then Save and close Notepad.
  echo     - Then double-click Start-Printer again to begin printing.
  echo.
  start "" notepad ".env"
  echo   Press any key to close this window...
  pause >nul
  exit /b 0
)

REM --- 4. Start printing ---------------------------------------------------
echo   Starting up... leave this window open during service.
echo   Close this window to stop printing.
echo.
call npm start

REM If it stops (a crash, or you closed it), keep the window so the message is readable.
echo.
echo   The printer has stopped. If that wasn't on purpose, read the message above.
echo   Press any key to close...
pause >nul
