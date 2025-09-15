#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

# prefer local venv, fallback to workspace venv
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
elif [ -x "../.venv/bin/python" ]; then
  PY="../.venv/bin/python"
else
  echo "No virtualenv found. Create one in mcp-server/.venv or workspace .venv"
  exit 1
fi

# ensure uvicorn is available (install if missing)
if ! $PY -m pip show uvicorn >/dev/null 2>&1; then
  echo "Installing MCP server requirements..."
  $PY -m pip install -r requirements.txt
fi

# run uvicorn in foreground so Continue can connect
exec $PY -m uvicorn app:app --reload --host 127.0.0.1 --port 8001
