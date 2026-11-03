# DataForge Studio

An independently implemented local workspace for Python, SQL and reusable ETL pipelines. Built as a full-stack AI/ML and data-engineering portfolio project using real local execution and persisted results. No paid APIs or external credentials.

**Single-user local MVP.** Python execution is trusted-local and can access your host with your OS permissions. Keep both servers on loopback and never run untrusted code. See [security boundaries](docs/SECURITY.md).

## Implemented

- Dashboard with actual persisted resource/run counts, recent activity, measured execution-duration chart and workspace navigation.
- Python Lab: notebook CRUD; add/edit/reorder/delete cells; local Monaco syntax highlighting; sequential replay; stdout, stderr, exceptions, durations; basic code-cell `.ipynb` import/export; Pandas/NumPy and uploaded dataset access.
- SQL Lab: Monaco, table/column schema explorer, separate SQLite workspace, default read-only mode, explicitly enabled row writes, saved queries, capped result CSV export, query timeout protection and execution history.
- Datasets: CSV/XLSX upload, size/content/path validation, row/column counts, types, missing counts, preview, original download, deletion, and non-overwriting SQLite imports.
- Linear ETL builder: source/destination forms; drop duplicates, select/rename columns, fill/drop missing values, structured row filters; preview; save/edit/delete; reruns with unique outputs; CSV and SQLite destinations; measured row counts and errors.
- History: actual Python/SQL/ETL executions, filters, pagination and detailed results. Settings: version, connection/database status, runtime limits, storage path and limitations.

No fake users, operational metrics, execution responses, or proprietary product assets are included. AI assistance, graph canvas, durable kernels, Docker and multi-user/cloud deployment are deferred.

## Stack

Next.js **16.4.3**, React 19.3, strict TypeScript, Tailwind CSS 4, Lucide and locally bundled Monaco. Python 3.12, FastAPI, Pydantic, SQLAlchemy, SQLite, Pandas, NumPy, Pytest/HTTPX. Playwright uses an installed Chrome browser for acceptance testing. Next's supported Webpack mode and standard Tailwind PostCSS integration are used for compatibility with hosts that restrict Turbopack IPC.

## Ubuntu setup

Prerequisites: Python 3.12 with `venv`, Node.js 24 and npm, Bash, and a local Linux filesystem. Chrome is optional unless running browser acceptance tests. Ensure Python/Node are installed before proceeding.

```bash
cd ~/AI-Portfolio/dataforge-studio
# Reuse the existing virtual environment when present.
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cd frontend
npm ci
# Preserve an existing .env.local; create this only if absent:
cp -n .env.example .env.local
cd ..
./start.sh
```

The npm postinstall step builds local Monaco assets and copies the original synthetic demo CSV. No runtime CDN or hosted model is used. Package versions are pinned in `requirements.txt` / `package-lock.json`; the DOMPurify override and asset-builder substitution cover the editor's sanitizer dependency.

- Frontend: **http://localhost:3001**
- Backend health: **http://localhost:8001/api/v1/health**
- API docs: **http://localhost:8001/docs**

`start.sh` validates dependencies and both fixed ports, refuses occupied ports, and stops only its own process groups on exit. Ctrl+C ends the services it started. It does not kill existing user servers. Run one backend instance per storage home.

Manual launch in separate terminals, from the repository root:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

```bash
npm --prefix frontend run dev
```

Production frontend smoke launch after a build: `npm --prefix frontend run build`, then `npm --prefix frontend run start` (port 3001). This does not imply production hardening.

## Storage and configuration

`NEXT_PUBLIC_API_BASE_URL=http://localhost:8001` is the frontend setting. Backend data defaults to `backend/storage/`, relative to the backend package rather than the launch directory. Set `DATAFORGE_HOME=/absolute/local/path` in the shell to choose a different workspace. The backend `.env.example` documents this shell setting; dotenv auto-loading is not implemented. Do not point tests at your personal storage.

The metadata SQLite database stores notebooks/cells, dataset metadata, saved queries, pipeline definitions/runs and execution records. The workspace SQLite database contains query tables only. Uploaded originals and processed CSV outputs live in separate directories. Restarting with the same home preserves resources, tables, history and files. Dataset/pipeline deletion does not automatically remove imported tables or historical outputs. Back up the entire storage directory while services are stopped.

## Verify

```bash
./verify.sh
# Individual checks:
PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
# Optional real Chrome workflow, with both fixed ports free:
./scripts/e2e.sh
```

The backend suite uses temporary directories and databases. The browser harness creates a `/tmp/dataforge-e2e-*` home, asserts that isolation before mutations, starts both services, tests the full notebook/upload/SQL/ETL/history flow, and restarts the app to check persistence. It preserves logs, screenshots and failure traces in ignored `artifacts/` and leaves its temporary home available for inspection. It never overwrites personal application data. Chrome must be installed; alternatively configure Playwright's browser channel and install its managed browser explicitly.

CI runs `verify.sh` on pushes and pull requests; its remote execution is unverified until the workflow runs in GitHub. No push has been performed as part of implementation.

## Demo and screenshots

Follow the [interview walkthrough](docs/DEMO.md). `sample-data/retail_sales.csv` is original synthetic data: 245 rows including deliberate duplicate and missing-value cases. The default two-step ETL demo produces 233 clean rows. Numbers are properties of the checked-in fixture, not operational performance claims.

Run `scripts/e2e.sh` to capture desktop dashboard, pipeline and mobile dashboard screenshots under `artifacts/`. Review them before adding selected images to portfolio materials; generated artifacts are intentionally ignored by Git.

Further documentation: [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Security](docs/SECURITY.md), [Demo](docs/DEMO.md), [Verification evidence](docs/VERIFICATION.md).

## Known limitations

Python subprocess limits are not a secure sandbox. Each run replays prior cells and can repeat side effects; there is no durable notebook kernel. Import/export retains code cells only. Requests run synchronously; there is no distributed queue or cancellation UI. Workloads load into memory and have no retention policy or benchmarked concurrency capacity. SQL UI/export caps results at 500 rows; dataset/ETL previews cap at 100. Explicit SQL writes permit row mutation only; schema creation happens through controlled imports. A process interruption can leave external effects or orphan output artifacts. CSV spreadsheet formulas are not neutralized. Authentication, multi-tenancy and public deployment are out of scope.

## Portfolio talking points

- Built a full-stack local Python/SQL/ETL workspace with Next.js, FastAPI, SQLAlchemy and separated SQLite databases.
- Implemented typed, reusable Pandas transformation pipelines with previews, per-run output artifacts, row counts and persisted execution history.
- Added subprocess execution guardrails, connection-level SQL restrictions and automated API/browser acceptance coverage, while documenting the trusted-local security boundary.

Only claim measured performance, test results or deployment readiness when you have corresponding evidence. See the verification log for the checks actually executed in this workspace.
