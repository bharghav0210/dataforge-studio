# Executed verification

Verified locally on **30 October 2026**. This is evidence for this workspace run, not a production certification or performance benchmark.

## Automated checks

`./verify.sh` completed successfully:

| Check | Observed result |
| --- | --- |
| Backend Pytest suite | **11 passed**; isolated temporary homes/databases |
| Local Monaco asset generation | Passed; patched DOMPurify 3.4.17 present in generated browser bundle |
| ESLint | Passed, no errors or warnings |
| Next route type generation + TypeScript `--noEmit` | Passed with strict checking |
| Next.js production build | Passed with Webpack; all application routes generated |
| Shell syntax | `bash -n start.sh verify.sh scripts/e2e.sh` passed |
| npm installation audit | Reported **0 known vulnerabilities** after sanitizer override; a point-in-time dependency check only |

Backend coverage includes health and original root response; Origin/Host rejection; notebook CRUD and code-cell import/export; code whitespace preservation; sequential replay; stdout/errors; Pandas/NumPy and dataset access; environment-secret omission; Python timeout and output cap; session cleanup; invalid/traversal filenames; normalized Windows filenames stored under server UUIDs; malformed, empty, oversized and binary CSV; Excel; dataset metadata/preview/download; SQL import collision protection; read-only and explicit write behavior; metadata/ATTACH/PRAGMA/extension/file restrictions; invalid/multiple SQL statements; recursive query interruption; capped results and duplicate labels; saved queries; all six ETL transformations; malformed definitions; preview, saved pipeline execution/reruns and errors; referenced-dataset deletion protection; history filtering; restart persistence; interrupted-run reconciliation; preservation of user-deleted demo rows.

The sandbox blocked async test-client wakeups and Turbopack's local IPC port. Tests/builds were run with the required execution permission; the application uses Next's supported Webpack mode with Tailwind PostCSS. The failed intermediate builds/tests were repaired before the final passing checks. Chrome testing found dropped fast editor input; synchronizing Monaco's change callback with React state fixed the tested reproduction. Restart testing found an overly strict socket preflight; enabling address reuse on the probe permits recently closed sockets while still refusing live listeners.

## Real browser and HTTP acceptance

`./scripts/e2e.sh` launched the app on **8001 / 3001** with a new `/tmp/dataforge-e2e-*` home, used the installed Chrome browser through Playwright, and passed one full workflow test. No personal storage was used.

Verified actions:

1. Start backend and frontend using `start.sh`; dashboard renders.
2. Duplicate startup refuses occupied ports and leaves active services running.
3. Create and name a notebook; type into Monaco, save/run, display real output `42`.
4. Reload and reopen the persisted notebook.
5. Upload the checked-in synthetic CSV (245 rows), inspect it and import to a SQLite table.
6. Inspect SQL schema; type and run an aggregation; obtain four regional rows.
7. Save the query; download the actual result CSV.
8. Create a pipeline through the form with two transformations: drop duplicates, drop missing values.
9. Preview **245 → 233** rows; run successfully into a unique SQLite table and CSV; rerun successfully.
10. Inspect real execution history, filter to ETL, and open detailed output.
11. Inspect Settings and the execution-mode limitations.
12. Render dashboard at desktop and 390px mobile widths; mobile has no document-level horizontal overflow.
13. No browser `pageerror` events occurred in the successful workflow.
14. Stop owned services, restart against the same home, verify persisted notebook content, uploaded dataset, saved query, pipeline, both ETL output tables, original imported table and execution records over HTTP.

Post-restart observed counts: **1 notebook, 1 dataset, 1 saved query, 1 pipeline, 4 successful executions, 0 failed executions**. These numbers belong to the isolated acceptance fixture, not a hardcoded dashboard or the user's workspace.

Logs/screenshots are generated under ignored `artifacts/`: `verification.log`, `e2e-servers.log`, `e2e-restart.log`, `dashboard-desktop.png`, `dashboard-mobile.png`, `pipeline-desktop.png`. Temporary test homes remain available for inspection. The harness stops only services it started.

## Limits of verification

GitHub-hosted CI execution, Windows/macOS behavior, Docker, public deployment, multi-user operation, malicious Python containment, exhaustive accessibility, broad cross-browser compatibility, load capacity and production hardening were **not verified**. The checkout's `.git` directory is not usable as Git metadata in this environment (`git status` reports “not a git repository”); no repository initialization, commit or push was performed.

The browser acceptance flow ran against the development server. Production compilation was checked separately; production-server smoke status is recorded below if executed. Dataset/ETL previews and SQL exports are capped by design. Timing values are measured per execution; no throughput or speed claims are made.

Final UI check: result previews now use a bounded scrollable viewport with sticky headers. The full Chrome workflow, duplicate-start protection and real restart checks passed again after this change (`artifacts/browser-verification.log`); the final production rebuild also passed (`artifacts/production-build.log`). Production-server runtime smoke was not executed separately. Test-owned servers were stopped after verification; use `./start.sh` to launch the personal workspace.
