@echo off
REM Double-click this to start the cup label printer.
REM Put a shortcut to it in shell:startup to have it run when the PC boots.
cd /d "%~dp0"
title LOTG Cup Label Printer
npm start
REM Keeps the window open if it crashes, so the error is readable instead of vanishing.
pause
