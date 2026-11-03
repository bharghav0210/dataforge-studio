#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
ROOT="$PWD"
PY="$ROOT/backend/.venv/bin/python"
[[ -x "$PY" ]] || { echo 'Missing backend/.venv. Follow README installation instructions.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required.' >&2; exit 1; }
[[ -d frontend/node_modules/next ]] || { echo 'Run npm ci in frontend first.' >&2; exit 1; }
"$PY" -c 'import fastapi, uvicorn, sqlalchemy, pandas, numpy, multipart' || exit 1
# Check both ports before starting anything. Never kill existing listeners.
"$PY" - <<'PY'
import socket, sys
for port in (8001, 3001):
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(('127.0.0.1', port))
        except OSError as exc:
            sys.exit(f'Port {port} is unavailable ({exc}). Stop or reconfigure its owner yourself. No existing processes were terminated.')
PY
node frontend/scripts/prepare-monaco.mjs
BACK_PID=''
FRONT_PID=''
cleanup() {
  trap - EXIT INT TERM
  # Each child has a dedicated process group, created below with start_new_session.
  [[ -z "$BACK_PID" ]] || kill -TERM -- "-$BACK_PID" 2>/dev/null || true
  [[ -z "$FRONT_PID" ]] || kill -TERM -- "-$FRONT_PID" 2>/dev/null || true
  [[ -z "$BACK_PID" ]] || wait "$BACK_PID" 2>/dev/null || true
  [[ -z "$FRONT_PID" ]] || wait "$FRONT_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# exec keeps the process PID equal to its process-group ID, including Next's children.
"$PY" -c 'import os; os.setsid(); os.chdir("backend"); os.execv(".venv/bin/python", [".venv/bin/python", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"])' &
BACK_PID=$!
"$PY" -c 'import os; os.setsid(); os.chdir("frontend"); os.execvp("npm", ["npm", "run", "dev"])' &
FRONT_PID=$!
echo 'DataForge Studio starting: http://localhost:3001 | API: http://localhost:8001/docs'
echo 'Press Ctrl+C to stop only the services started by this script.'
wait -n "$BACK_PID" "$FRONT_PID"
