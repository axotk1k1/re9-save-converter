#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if server is already running on port 8765
if ! (exec 3<>/dev/tcp/127.0.0.1/8765) 2>/dev/null; then
    echo "Starting GUI server on http://127.0.0.1:8765 ..."
    python3 "$DIR/server.py" >/dev/null 2>&1 &
    sleep 0.8
else
    exec 3>&- 2>/dev/null || true
fi

URL="http://127.0.0.1:8765"

# If chromium is available, open as a clean standalone desktop app window
if command -v chromium >/dev/null 2>&1; then
    chromium --app="$URL" --user-data-dir="/tmp/re9_save_gui_profile" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null 2>&1; then
    google-chrome --app="$URL" >/dev/null 2>&1 &
else
    xdg-open "$URL" >/dev/null 2>&1 &
fi
