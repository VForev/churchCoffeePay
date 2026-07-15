#!/bin/bash
# Double-click this on a Mac to start the cup label printer.
# (If it won't open, run once in Terminal: chmod +x start-printer.command)
cd "$(dirname "$0")"
echo "LOTG Cup Label Printer"
echo "Keep this window open during service. Close it (or press Ctrl+C) to stop."
echo ""
# `caffeinate -i` keeps the Mac from idle-sleeping while the printer is running,
# so it can't fall asleep mid-service and quietly stop printing labels.
caffeinate -i npm start
# Keep the window open if it stops, so any message stays readable.
echo ""
echo "The printer agent stopped. Press any key to close."
read -n 1
