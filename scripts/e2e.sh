#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# start.sh checks both fixed ports and refuses to disturb existing services.
export DATAFORGE_HOME
DATAFORGE_HOME="$(mktemp -d /tmp/dataforge-e2e-XXXXXX)"
mkdir -p artifacts
echo "Isolated browser-test storage: $DATAFORGE_HOME"
./start.sh >artifacts/e2e-servers.log 2>&1 &
SERVICES_PID=$!
cleanup() { kill -TERM "$SERVICES_PID" 2>/dev/null || true; wait "$SERVICES_PID" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
backend/.venv/bin/python - <<'PY'
import time, urllib.request, sys
for _ in range(120):
    try:
        with urllib.request.urlopen('http://localhost:3001/dashboard', timeout=2) as response:
            if response.status == 200:
                break
    except Exception:
        time.sleep(0.5)
else:
    sys.exit('Frontend not ready. Inspect artifacts/e2e-servers.log; check for port conflicts.')
PY
# A duplicate launch must fail without disturbing this harness's servers.
backend/.venv/bin/python - <<'PY'
import subprocess, urllib.request
r = subprocess.run(['./start.sh'], capture_output=True, text=True, timeout=10)
assert r.returncode != 0 and 'Port 8001 is unavailable' in r.stderr, r
assert urllib.request.urlopen('http://localhost:8001/api/v1/health').status == 200
print('PASS: duplicate startup refused without stopping active services')
PY
(cd frontend && npm run test:e2e)
# Compare the whole suite's actual persisted state, rather than assuming an empty history.
backend/.venv/bin/python - <<'PY_SNAPSHOT'
import hashlib, json, os, pathlib, urllib.request
home = pathlib.Path(os.environ['DATAFORGE_HOME'])
paths = ['/dashboard', '/notebooks', '/datasets', '/sql/queries', '/pipelines', '/executions?limit=200', '/sql/schema']
state = {}
for path in paths:
    with urllib.request.urlopen('http://localhost:8001/api/v1' + path, timeout=5) as response:
        state[path] = json.load(response)
state['output_hashes'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (home / 'outputs').glob('*.csv')}
(home / 'e2e-snapshot.json').write_text(json.dumps(state))
PY_SNAPSHOT
kill -TERM "$SERVICES_PID"
wait "$SERVICES_PID" || true
./start.sh >artifacts/e2e-restart.log 2>&1 &
SERVICES_PID=$!
backend/.venv/bin/python - <<'PY_RESTART'
import hashlib, json, os, pathlib, time, urllib.request, sys
home = pathlib.Path(os.environ['DATAFORGE_HOME'])
expected = json.loads((home / 'e2e-snapshot.json').read_text())
last_error = None
for _ in range(60):
    try:
        actual = {}
        for path in expected:
            if path == 'output_hashes':
                actual[path] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (home / 'outputs').glob('*.csv')}
            else:
                with urllib.request.urlopen('http://localhost:8001/api/v1' + path, timeout=5) as response:
                    actual[path] = json.load(response)
        assert actual == expected, 'Persisted resource, history, schema or output changed on restart'
        print('PASS: actual HTTP restart persistence', actual['/dashboard']['counts'])
        break
    except Exception as exc:
        last_error = exc
        time.sleep(0.5)
else:
    sys.exit(f'Restart persistence verification failed: {last_error!r}. Inspect artifacts/e2e-restart.log.')
PY_RESTART
