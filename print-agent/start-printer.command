#!/bin/bash
# Double-click this on a Mac to start the cup label printer.
# (If it won't open, run once in Terminal: chmod +x start-printer.command)
#
# The first time you run it, it sets itself up. After that, just double-click.
cd "$(dirname "$0")"

echo "LOTG Cup Label Printer"
echo "----------------------"
echo ""

# --- 1. Is Node.js installed? --------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed on this computer yet. It's a free, one-time install."
  echo ""
  echo "  1. The download page is opening in your browser."
  echo "  2. Get the 'LTS' macOS installer and run it."
  echo "  3. Close this window, then double-click Start-Printer again."
  echo ""
  open "https://nodejs.org/en/download"
  echo "Press any key to close..."
  read -n 1
  exit 0
fi

# --- 2. First run: install the printer software --------------------------
if [ ! -d "node_modules" ]; then
  echo "First-time setup: installing the printer software..."
  echo "This takes a minute or two. You'll only see this once."
  echo ""
  if ! npm install; then
    echo ""
    echo "Setup couldn't finish. Check the internet connection and try again."
    echo "Press any key to close..."
    read -n 1
    exit 1
  fi
  echo ""
fi

# --- 3. First run: create the settings file ------------------------------
if [ ! -f ".env" ]; then
  [ -f ".env.example" ] && cp ".env.example" ".env"
  echo "One more thing before we can print: your connection details."
  echo "The settings file is opening in a text editor."
  echo ""
  echo "  - Paste the details from the 'Set Up the Cup Printer' page in the"
  echo "    admin panel, then save and close the editor."
  echo "  - Then double-click Start-Printer again to begin printing."
  echo ""
  open -e ".env"
  echo "Press any key to close..."
  read -n 1
  exit 0
fi

# --- 4. Start printing ---------------------------------------------------
echo "Starting up... leave this window open during service. Close it (or Ctrl+C) to stop."
echo ""
# `caffeinate -i` keeps the Mac from idle-sleeping mid-service and quietly stopping.
caffeinate -i npm start

echo ""
echo "The printer agent stopped. Press any key to close."
read -n 1
