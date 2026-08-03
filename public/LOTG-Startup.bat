@echo off
REM ============================================================
REM  LOTG - start everything when the PC turns on
REM
REM  What it does at startup:
REM    1. starts the cup-label printer
REM    2. opens the live orders screen (/live) in Chrome
REM
REM  HOW TO MAKE IT RUN AT STARTUP (do this once):
REM    1. Keep this file in the SAME folder as LOTG-Printer.bat.
REM    2. Press  Win + R , type   shell:startup   and press Enter.
REM    3. Copy this file (or a shortcut to it) into the folder that opens.
REM  From then on it runs by itself every time the computer starts.
REM ============================================================


REM ===== EDIT THIS ONE LINE ===================================
REM Your live orders page - the same address you'd type to watch
REM orders come in. Replace the example below with your real one.
set "LIVE_URL=https://YOUR-SITE.netlify.app/live"
REM ============================================================


REM The printer launcher to run. By default it's LOTG-Printer.bat
REM sitting next to this file. If you still use the older
REM start-printer.bat, put its full path here instead, e.g.:
REM   set "PRINTER_BAT=C:\Users\450 G1\Documents\churchCoffeePay\print-agent\start-printer.bat"
set "PRINTER_BAT=%~dp0LOTG-Printer.bat"


REM --- 1. Start the printer in its own window ------------------
if exist "%PRINTER_BAT%" (
  start "LOTG Cup Label Printer" "%PRINTER_BAT%"
) else (
  echo Could not find the printer launcher at:
  echo   %PRINTER_BAT%
  echo Edit the PRINTER_BAT line above to point at it, then try again.
  echo Press any key to close...
  pause >nul
)


REM --- 2. Give the desktop and Wi-Fi a few seconds to wake up --
timeout /t 15 /nobreak >nul


REM --- 3. Open the live screen in Chrome, full-screen ---------
REM --start-fullscreen fills the whole screen (press F11 to exit).
REM Swap it for  --kiosk  if you want it locked with no way out but Alt+F4.
start "" chrome --new-window --start-fullscreen "%LIVE_URL%"

REM If Chrome doesn't open, it may not be found by name. Either make
REM Chrome your default browser and change the line above to:
REM   start "" "%LIVE_URL%"
REM or use Chrome's full path:
REM   start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window --start-fullscreen "%LIVE_URL%"

exit /b 0
