# DataForge Studio architecture

DataForge Studio is an independently implemented, single-user local modular monolith. Next.js 16.4.3 / React 19.3 provide an App Router UI; FastAPI serves versioned JSON APIs. No account, hosted model, cloud service, or external credential is required.

## Components and request flow

The browser at `http://localhost:3001` calls `http://localhost:8001/api/v1`. The frontend API helper handles JSON, multipart uploads, errors, and empty responses. Client components load persisted resources and submit explicit mutations. The dashboard counts records in the metadata database; it does not invent activity. Lucide icons and a shared dark layout provide navigation.

FastAPI `app/main.py` creates the application and initializes storage in its lifespan. `api/routes.py` defines resource endpoints and shares session/execution helpers. `schemas/` validates requests; `services/` contains dataframe, SQL, and subprocess behavior. SQLAlchemy sessions are scoped to each request. Synchronous routes run in FastAPI's worker thread pool.

Monaco is built from its modules into local browser assets using esbuild. Python and SQL tokenizers and a local editor worker are included. The asset builder replaces Monaco's vendored sanitizer with the patched, pinned DOMPurify dependency. Styles are bundled by Next.js. There is no runtime CDN dependency. Webpack and Tailwind PostCSS are used because this execution host restricts Turbopack IPC. Next.js and React versions are preserved.

## Persistence

`DATAFORGE_HOME` defaults to `backend/storage`:

| Location | Purpose |
| --- | --- |
| `metadata.sqlite3` | Notebooks, ordered notebook cells, datasets, saved queries, pipelines, pipeline runs, execution records |
| `workspace.sqlite3` | Demo data and imported/transformed query tables only |
| `uploads/` | UUID-named original CSV and Excel files |
| `outputs/` | One CSV per ETL execution |
| `sessions/` | Temporary execution working directories, removed after each run |

Models use UUID identifiers, timestamps, foreign keys and indexes. Notebook deletion cascades to its cells. Dataset deletion is rejected while pipelines reference it. Pipeline deletion removes pipeline-run join records but preserves execution history and output files. Historical resource references are identifiers/snapshots rather than cascading foreign keys so deletion does not erase execution history. `Base.metadata.create_all` explicitly initializes the schema; there is no migration framework yet. Future schema changes require a migration plan and backups.

The metadata database uses WAL mode and foreign key enforcement. SQL Lab opens only the fixed workspace database. A three-row `demo_sales` synthetic table is seeded only when that table is first created. Uploaded datasets are never auto-seeded or auto-imported.

## Execution lifecycle

A request creates and commits an execution record with `running` status. The service performs real work; completion persists status, timestamps, measured wall duration, errors, result preview, and any output reference. The blocking endpoint returns the completed record. SQL errors and Python exceptions are returned as execution records with `failed` status; request-validation failures use HTTP errors and do not create executions.

On restart, remaining `running` records are marked failed with an interruption message. A single backend process is supported; running multiple backend instances against the same home would make restart reconciliation unsafe. There is no background task queue, durable job recovery, or remote execution worker.

### Python

Run cell replays saved cells from the beginning through the selected index. Run all replays every saved cell. Each run uses one fresh process and a shared namespace across those cells, stopping at the first exception. Output includes stdout/stderr from all replayed cells. State is not retained between requests. Replays can repeat side effects.

The runner starts the virtual environment's interpreter with `-I -u`, a clean environment allowlist, a temporary working directory, and no shell. The child receives code through stdin and `DATASET_DIR` as a namespace variable. A selector drains stdout/stderr with a combined byte cap. A wall deadline and process-group termination bound accidental hangs; Unix resource limits guard CPU, virtual address space, open files, and per-file output size. This is trusted local execution, not a sandbox.

### SQL

The default SQLite connection uses URI `mode=ro`. Explicit write mode uses `mode=rw` and permits INSERT/UPDATE/DELETE against existing workspace tables. A connection authorizer denies ATTACH, PRAGMA, DDL, extension loading, and file helper functions in both modes. One statement per request, a progress-handler deadline, lock timeout and capped result fetch reduce accidental workload. Results and CSV exports contain at most 500 rows. Duplicate column labels are disambiguated.

### ETL

Pydantic validates a linear JSON definition: source dataset, ordered steps, destination. Pandas loads the original and applies a copy of the data sequentially: duplicate removal, column selection/renaming, missing-value filling/removal, and structured comparisons or literal substring matching. No expression evaluation is used.

Preview returns up to 100 rows without writing a destination or execution history. Run reloads the saved definition, records its execution, validates the result preview, stages a unique CSV, and optionally imports a unique SQLite table. The table prefix is truncated to 24 characters and receives an execution-ID suffix; reruns preserve previous outputs. CSV publication uses an atomic no-overwrite hard link, with the staging inode retained until metadata completion commits. Caught failures remove only owned staging/publication artifacts. PipelineRun links the pipeline to the execution and row counts. Filesystem and SQLite transactions remain separate: abrupt termination can leave an artifact, and a committed workspace table can survive a subsequent publication or metadata failure. Failed executions are labeled and are not offered as successful downloads.

## Trade-offs

Small bounded local workloads favor understandable code and SQLite over queues or distributed DAGs. Form-based pipeline editing exposes actual execution semantics; no decorative graph is used. Full dataframes are loaded into memory, history previews consume metadata storage, and there is no retention policy. Notebooks import/export only code cells, without rich output or markdown preservation. Optional AI, authentication, multi-tenancy, Docker and a graph canvas are deferred.
