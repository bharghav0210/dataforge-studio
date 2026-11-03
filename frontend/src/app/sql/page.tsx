"use client";
import { useState } from "react";
import { Play, Save, Database, Trash2, RefreshCw } from "lucide-react";
import { PageTitle } from "@/components/shell";
import { CodeEditor } from "@/components/editor";
import { Empty, ExecutionResult, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad, useTask } from "@/lib/hooks";
import type { SchemaTable, SavedQuery, Execution } from "@/types";
export default function SQLPage() {
  const schema = useLoad<SchemaTable[]>("/sql/schema");
  const queries = useLoad<SavedQuery[]>("/sql/queries");
  const task = useTask();
  const [source, setSource] = useState(
    "SELECT region, SUM(revenue) AS total_revenue\nFROM demo_sales\nGROUP BY region\nORDER BY total_revenue DESC;",
  );
  const [name, setName] = useState("Regional revenue");
  const [write, setWrite] = useState(false);
  const [execution, setExecution] = useState<Execution>();
  return (
    <>
      <PageTitle
        eyebrow="QUERY & UNDERSTAND"
        title="SQL Lab"
        description="A direct line to your data, with SQLite under the hood."
        actions={
          <span className="connection-label">
            <span className="online-dot" /> Local workspace database
          </span>
        }
      />
      <Notice
        error={task.error || schema.error || queries.error}
        message={task.message}
      />
      <div className="workspace-grid">
        <aside className="panel resource-list">
          <div className="panel-heading">
            <h2>Schema explorer</h2>
            <button
              className="icon-button"
              aria-label="Refresh schema"
              onClick={schema.reload}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {schema.data?.map((t) => (
            <details key={t.name} className="schema-table" open>
              <summary>
                <Database size={14} />
                {t.name}
              </summary>
              {t.columns.map((c) => (
                <div className="schema-column" key={c.name}>
                  <span>{c.name}</span>
                  <small>{c.type || "ANY"}</small>
                </div>
              ))}
            </details>
          ))}
          <div className="panel-heading">
            <h2>Saved queries</h2>
            <span className="count-pill">{queries.data?.length ?? 0}</span>
          </div>
          {queries.data?.length ? (
            queries.data.map((q) => (
              <div className="saved-query" key={q.id}>
                <button
                  className="text-button"
                  onClick={() => {
                    setSource(q.sql);
                    setName(q.name);
                  }}
                >
                  {q.name}
                </button>
                <button
                  className="icon-button danger"
                  aria-label="Delete saved query"
                  onClick={() =>
                    task.run(async () => {
                      if (!confirm("Delete saved query?")) return;
                      await api(`/sql/queries/${q.id}`, "DELETE");
                      await queries.reload();
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          ) : (
            <Empty>Save a query for later.</Empty>
          )}
        </aside>
        <div className="workspace-main">
          <section className="panel">
            <div className="panel-heading">
              <div className="row">
                <span className="tab-active">query.sql</span>
                <span className="tiny muted">SQLITE</span>
              </div>
              <button
                className="primary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    setExecution(
                      await api<Execution>("/sql/run", "POST", {
                        sql: source,
                        allow_write: write,
                      }),
                    );
                    await schema.reload();
                  })
                }
              >
                <Play size={14} />
                {task.busy ? "Running…" : "Run query"}
              </button>
            </div>
            <CodeEditor
              value={source}
              onChange={setSource}
              language="sql"
              height={300}
            />
            <div className="sql-options">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={write}
                  onChange={(e) => setWrite(e.target.checked)}
                />{" "}
                Enable row writes (INSERT, UPDATE, DELETE)
              </label>
              <span className="tiny muted">500 ROW CAP · 3s QUERY LIMIT</span>
            </div>
            {write && (
              <div className="info-strip warning">
                Writes modify workspace tables. Application metadata, ATTACH,
                PRAGMA, and schema changes remain restricted.
              </div>
            )}
            <div className="save-query">
              <input
                aria-label="Saved query name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Query name"
              />
              <button
                disabled={task.busy || !name.trim()}
                onClick={() =>
                  task.run(async () => {
                    await api("/sql/queries", "POST", { name, sql: source });
                    await queries.reload();
                  }, "Query saved.")
                }
              >
                <Save size={14} /> Save query
              </button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Query results</h2>
              <span className="muted tiny">ACTUAL EXECUTION OUTPUT</span>
            </div>
            <ExecutionResult execution={execution} />
          </section>
        </div>
      </div>
    </>
  );
}
