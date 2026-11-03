# Interview demonstration

Use `./start.sh`; open `http://localhost:3001`. This is a single-user local workspace. Only run Python you trust. There are no paid APIs or external credentials.

## 1. Start with real persisted state

Open Overview. Resource counts and execution statuses are derived from SQLite. A fresh workspace has zero notebooks, datasets, saved queries and pipelines; a three-row synthetic `demo_sales` table is available in SQL Lab. Empty history is intentional. Explain database separation and the lack of authentication in a loopback-only MVP.

## 2. Upload and inspect

In Datasets, download the synthetic demo CSV if needed, then upload `sample-data/retail_sales.csv` (245 data rows, 10 columns). It contains original synthetic records, five deliberate duplicates, and seven missing quantity values. No real customer information is used.

Click the dataset. Inspect column types, missing counts and the first 100 rows. Download Original to demonstrate file preservation. Copy its UUID filename from the detail panel.

## 3. Analyze in Python

Create a notebook in Python Lab; rename it `Retail analysis`. Replace the first code cell with the following, substituting the actual filename displayed in Datasets:

```python
from pathlib import Path
import pandas as pd
import numpy as np

df = pd.read_csv(Path(DATASET_DIR) / "<uploaded-uuid>.csv")
print("Rows:", len(df))
print("Missing quantity:", df["quantity"].isna().sum())
print("Median price:", np.median(df["unit_price"]))
```

Add another cell:

```python
clean = df.drop_duplicates().dropna()
print("Clean rows:", len(clean))
print(clean.groupby("region")["quantity"].sum())
```

Save, then Run all. Expected row outputs: 245 input rows, 7 missing quantities, 233 clean rows. Run cell on the second cell: cells 1 and 2 are replayed in one new process. State is not durable between requests; replay repeats prior side effects. Inspect measured execution duration and stdout. Export the saved notebook as `.ipynb`, then import it to show basic code-cell compatibility. Rich output and markdown are not retained.

Optional failure demonstration: add `raise ValueError("demo failure")` in a new cell. Run it and show the real traceback and failed execution in history. Delete or correct that cell afterward.

## 4. Query data with SQL

Back in Datasets, import the original into a new table named `retail_sales`. If that table already exists, choose a different name; imports never overwrite tables. Open SQL Lab and refresh schema if already open. Inspect all table columns.

```sql
SELECT region,
       COUNT(*) AS orders,
       ROUND(SUM(quantity * unit_price * (1 - discount)), 2) AS revenue
FROM retail_sales
GROUP BY region
ORDER BY revenue DESC;
```

Run and inspect four regional result rows. Save as `Regional revenue`. Download CSV. The UI and export are capped at 500 query result rows; this is not a full-database export. Read-only is the default. Explain that explicit write mode permits row changes on existing workspace tables, while metadata, ATTACH, PRAGMA and schema changes remain restricted.

## 5. Build a repeatable ETL flow

Open Pipelines, create `Retail cleanup`, choose the uploaded dataset, and retain the two default transformations:

1. Drop duplicates, all columns.
2. Drop missing values, all columns.

Choose `Workspace SQLite table + CSV` with prefix `clean_retail`. Preview: **245 input → 233 output rows**. Save & run. Inspect successful status, actual measured duration, preview and input/output counts. Download the processed CSV. Open SQL Lab, refresh schema, then query the actual unique table name returned by the run:

```sql
SELECT COUNT(*) AS cleaned_rows FROM clean_retail_<actual_run_suffix>;
```

Expected result: 233. Rerun the saved pipeline: the new run gets a different destination table and its own CSV. Existing outputs remain intact. Demonstrate filter, fill, select and rename if useful; numeric filtering needs the Numeric value checkbox. Rename input uses `old=new` pairs separated by commas.

## 6. Audit and persistence

Open Execution history. Filter type to ETL and status to Success. Inspect a detail view: unique ID, resource, started/completed times, actual duration, row counts, output table/CSV. Reset filters to see Python and SQL executions too.

Return to Overview. Counts and recent durations reflect actual activity. Settings shows the backend/database check and configured resource limits alongside the trusted-local warning.

Stop the services started by `start.sh` with Ctrl+C. Run `./start.sh` again using the same `DATAFORGE_HOME`. Reopen the saved notebook, query and pipeline and confirm history survives. Different homes intentionally represent separate workspaces.

## Troubleshooting

- Port conflict: `start.sh` refuses to start or kill existing listeners. Identify the owner yourself and stop it only when appropriate. Required ports remain 8001 and 3001.
- Backend unavailable: verify `http://localhost:8001/api/v1/health`, inspect server logs, and check `NEXT_PUBLIC_API_BASE_URL=http://localhost:8001` in `frontend/.env.local`. Restart Next.js after environment changes.
- Editor missing: run `npm --prefix frontend run postinstall`, then reload. The editor, worker and CSS are local assets.
- SQL import collision: select a new table name. Pipeline tables intentionally have per-run suffixes.
- CSV error: use UTF-8 CSV with headers, at least one row, no more than 100 columns / 100,000 rows and up to 10 MiB. Excel `.xlsx` is also accepted; legacy `.xls` is not.
- Pipeline type errors: inspect column names and data types. Numeric comparisons require numeric values. Preview validates dataframe-dependent operations before running.
- Timeout/output limit: reduce code workload or printed output. These are honest failures with persisted execution records, not simulated results.
- Verification in a restricted agent environment can require permission for local sockets, process launches, or Chrome. A check that could not run is unverified.
