#!/usr/bin/env bash
set -uo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
failures=0
check() {
  local label="$1"
  shift
  echo "Running: $label"
  if "$@"; then
    echo "PASS: $label"
  else
    echo "FAIL: $label" >&2
    failures=$((failures + 1))
  fi
}
check 'Backend tests (isolated temporary storage)' env PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests -q
check 'Local editor and sample assets' node frontend/scripts/prepare-monaco.mjs
check 'Frontend ESLint' npm --prefix frontend run lint
check 'Frontend TypeScript' npm --prefix frontend run typecheck
check 'Frontend production build' npm --prefix frontend run build
if (( failures )); then
  echo "$failures verification checks failed." >&2
  exit 1
fi
echo 'All verification checks passed.'
