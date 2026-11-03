# DataForge Studio API

Base: `http://localhost:8001/api/v1`. Interactive schema: [Swagger UI](http://localhost:8001/docs); JSON schema: [OpenAPI](http://localhost:8001/openapi.json). This document describes the implemented contract; OpenAPI provides exact request validation.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/health` | Existing health response preserved |
| GET | `/dashboard` | Persisted counts and 12 recent execution records |
| GET | `/settings` | Runtime limits, database check, storage location, limitations |
| GET / POST | `/notebooks` | List / create notebooks |
| GET / PUT / DELETE | `/notebooks/{id}` | Read / replace name and ordered cells / delete |
| POST | `/notebooks/import` | Multipart `file`: format-4 `.ipynb`, code cells only |
| GET | `/notebooks/{id}/export` | Basic format-4 `.ipynb` download |
| POST | `/python/run` | `notebook_id`, optional `cell_index` (zero-based); returns execution record |
| GET / POST | `/datasets` | List / upload CSV or XLSX in multipart `file` |
| GET / DELETE | `/datasets/{id}` | Metadata + preview / delete original unless referenced by a pipeline |
| GET | `/datasets/{id}/download` | Download original file |
| POST | `/datasets/{id}/import-sql` | `{"table":"retail_sales"}`; fails on existing table |
| GET | `/sql/schema` | Fixed workspace table/column definitions |
| POST | `/sql/run` | `sql`, optional `allow_write` (default false); returns execution record |
| GET / POST | `/sql/queries` | List / save query with `name`, `sql` |
| DELETE | `/sql/queries/{id}` | Delete saved query |
| GET / POST | `/pipelines` | List / create a validated pipeline definition |
| PUT / DELETE | `/pipelines/{id}` | Replace / delete saved definition |
| POST | `/pipelines/preview` | Process unsaved definition; no destination writes |
| POST | `/pipelines/{id}/run` | Execute saved pipeline; return persisted execution record |
| GET | `/executions` | Filter by `kind`, `status`; paginate with `offset`, `limit` (1–200, default 50) |
| GET | `/executions/{id}` | Full persisted execution detail |
| GET | `/executions/{id}/download` | Successful SQL capped CSV or ETL output CSV |

Root `GET /` is retained. No arbitrary connection strings or paths are accepted. Create routes return 201; deletions return 204. Invalid requests return 422; malformed files/processing previews return 400, missing resources 404, referenced-dataset deletion 409, oversized uploads 413. Execution failures return HTTP 200 with `status: "failed"` and `error`; clients must inspect status. Execution types are `python`, `sql`, `etl`.

## Notebook

```json
{"name":"Analysis","cells":[{"source":"x = 21"},{"source":"print(x * 2)"}]}
```

The UI saves before running. Running index 1 replays both cells in one fresh interpreter. Results contain stdout, stderr, exit code and replayed-cell count. Notebooks support at most 100 cells and 100,000 characters per cell, subject to the total HTTP body limit.

## Pipeline definition

```json
{
  "name": "Retail cleanup",
  "dataset_id": "UUID returned by dataset upload",
  "steps": [
    {"op": "drop_duplicates"},
    {"op": "fill_missing", "column": "quantity", "value": 0},
    {"op": "filter", "column": "quantity", "condition": "gte", "value": 2},
    {"op": "rename", "mapping": {"product_category": "category"}},
    {"op": "select", "columns": ["region", "category", "quantity"]}
  ],
  "destination": "sqlite",
  "table": "clean_sales"
}
```

Supported operations: `drop_duplicates` (optional columns), `drop_missing` (optional columns), `select` (required columns), `rename` (mapping), `fill_missing` (column/value), `filter` (column/value/condition). Filter conditions: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains` (literal substring, no regex). Numeric comparisons require numeric JSON values. Unknown fields and operation names are rejected. Data-dependent errors are reported during preview or execution. Maximum 30 steps. Destination is `csv` or `sqlite`; every run writes its own CSV. SQLite tables receive unique suffixes.

A preview contains `columns`, `rows`, `row_count`, `truncated` and `input_rows`. Successful ETL execution results also contain `output_rows` and the actual `table` if written. Execution records include ID, type, resource snapshot, started/completed timestamps, measured duration, status, error, result and output reference.

`GET /pipelines/{id}` also returns a saved pipeline with its full validated definition.

## Reliability boundaries

SQL NaN and infinities are explicit JSON strings: `[non-finite: NaN]`,
`[non-finite: Infinity]`, and `[non-finite: -Infinity]`. Finite numbers remain
numbers. The same normalization applies to persisted results, history and dashboard
responses, including legacy records on read without rewriting those records.
SQL CSV exports use these markers too. A result-producing mutation such as
`UPDATE ... RETURNING` completes its transaction even when more than 500 rows are
returned; only the first 500 are retained for display/export. Read queries retain
their cap, and the existing SQL deadline and authorizer still apply.

CSV records must have the header's field count. Malformed records return HTTP 400
with the physical line and expected/actual field counts before Pandas can infer an
index. Quoted commas, multiline fields, UTF-8 BOM and blank physical lines remain
supported. Dataset column identifiers are strings throughout previews, SQL imports
and ETL. Collisions after string conversion receive deterministic suffixes that
avoid existing names; Excel headers `1`, `"1"`, `"1_2"` become `"1"`, `"1_3"`,
`"1_2"`, preserving all three values.
