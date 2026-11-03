"use client";
import { useRef, useState } from "react";
import {
  Upload,
  Download,
  Trash2,
  Database,
  Files,
  Search,
} from "lucide-react";
import { PageTitle } from "@/components/shell";
import { DataTable, Empty, Loading, Notice } from "@/components/ui";
import { api, apiUrl } from "@/lib/api";
import { useLoad, useTask } from "@/lib/hooks";
import type { Dataset } from "@/types";
export default function DatasetsPage() {
  const list = useLoad<Dataset[]>("/datasets");
  const task = useTask();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Dataset>();
  const [filter, setFilter] = useState("");
  const [table, setTable] = useState("retail_sales");
  const filtered = list.data?.filter((d) =>
    d.name.toLowerCase().includes(filter.toLowerCase()),
  );
  async function inspect(id: string) {
    setSelected(await api<Dataset>(`/datasets/${id}`));
  }
  return (
    <>
      <PageTitle
        eyebrow="INGEST & INSPECT"
        title="Your datasets"
        description="Bring the raw ingredients. We’ll help you put them to work."
        actions={
          <button
            className="primary"
            disabled={task.busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={15} />
            {task.busy ? "Working…" : "Upload dataset"}
          </button>
        }
      />
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept=".csv,.xlsx"
        aria-label="Upload dataset"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void task.run(async () => {
              const form = new FormData();
              form.append("file", file);
              const d = await api<Dataset>("/datasets", "POST", form);
              await list.reload();
              await inspect(d.id);
            }, "Dataset uploaded and inspected.");
          e.target.value = "";
        }}
      />
      <Notice error={list.error || task.error} message={task.message} />
      <div className="upload-banner">
        <span className="tool-icon blue">
          <Files size={24} />
        </span>
        <div>
          <h3>A home for your data</h3>
          <p>CSV & Excel · Up to 10 MB · 100,000 rows · Originals preserved</p>
        </div>
        <a href="/sample-data/retail_sales.csv" download className="text-link">
          Download synthetic demo CSV <Download size={14} />
        </a>
      </div>
      <div className="search-input">
        <Search size={16} />
        <input
          aria-label="Filter datasets"
          placeholder="Find a dataset…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {list.loading && !list.data ? (
        <Loading />
      ) : filtered?.length ? (
        <div className="dataset-grid">
          {filtered.map((d) => (
            <button
              className={`dataset-card ${selected?.id === d.id ? "selected" : ""}`}
              key={d.id}
              onClick={() => task.run(() => inspect(d.id))}
            >
              <div className="row spread">
                <span className="metric-icon blue">
                  <Files size={19} />
                </span>
                <span className="tiny muted">
                  {d.original_name.split(".").pop()?.toUpperCase()}
                </span>
              </div>
              <h3>{d.name}</h3>
              <p>
                {d.rows.toLocaleString()} rows · {d.columns.length} columns
              </p>
              <div className="tiny muted">
                {(d.size / 1024).toFixed(1)} KB ·{" "}
                {new Date(d.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty>
            {filter
              ? "No datasets match your search."
              : "Upload a CSV or Excel file to start exploring."}
          </Empty>
        </section>
      )}
      {selected && (
        <section className="panel dataset-detail">
          <div className="panel-heading">
            <div>
              <h2>{selected.name}</h2>
              <p className="muted tiny mono">
                DATASET_DIR / {selected.filename}
              </p>
            </div>
            <div className="row">
              <a
                className="button small"
                href={apiUrl(`/datasets/${selected.id}/download`)}
              >
                <Download size={14} /> Original
              </a>
              <button
                className="danger"
                aria-label="Delete dataset"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    if (
                      !confirm(
                        "Delete the uploaded file? Imported SQL tables will remain.",
                      )
                    )
                      return false;
                    await api(`/datasets/${selected.id}`, "DELETE");
                    setSelected(undefined);
                    await list.reload();
                  }, "Dataset deleted.")
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="column-stats">
            {selected.columns.map((c) => (
              <div key={c.name}>
                <strong>{c.name}</strong>
                <span>{c.dtype}</span>
                <small>{c.missing} missing</small>
              </div>
            ))}
          </div>
          {selected.preview && <DataTable data={selected.preview} />}
          <div className="import-sql">
            <div>
              <h3>Query this dataset</h3>
              <p>
                Import into a new workspace table. Existing tables are
                preserved.
              </p>
            </div>
            <input
              aria-label="Destination table name"
              value={table}
              onChange={(e) => setTable(e.target.value)}
              placeholder="table_name"
            />
            <button
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  const result = await api<{ table: string; rows: number }>(
                    `/datasets/${selected.id}/import-sql`,
                    "POST",
                    { table },
                  );
                  if (!result.table) throw new Error("No table returned");
                }, `Imported into ${table}. Open SQL Lab and refresh the schema.`)
              }
            >
              <Database size={14} /> Import to SQLite
            </button>
          </div>
        </section>
      )}
    </>
  );
}
