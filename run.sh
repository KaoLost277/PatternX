#!/usr/bin/env bash
# Starts the Data Completeness Profiler locally on macOS.
set -euo pipefail

repository_root="$(cd "$(dirname "$0")" && pwd)"
venv_python="$repository_root/.venv/bin/python"

if [ ! -x "$venv_python" ]; then
    echo "Creating the Python virtual environment ..."
    python3 -m venv "$repository_root/.venv"
fi

echo "Installing the API dependencies ..."
"$venv_python" -m pip install --quiet -r "$repository_root/backend/requirements.txt"

if [ ! -d "$repository_root/frontend/node_modules" ]; then
    echo "Installing the web UI dependencies ..."
    (cd "$repository_root/frontend" && npm install)
fi

echo "Starting the API on http://127.0.0.1:8000 (loopback only) ..."
(cd "$repository_root/backend" && "$venv_python" -m app.serve) &
api_process_id=$!
trap 'kill "$api_process_id" 2>/dev/null || true' EXIT

echo "Starting the web UI on http://localhost:5173 ..."
cd "$repository_root/frontend"
npm run dev
