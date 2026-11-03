"use client";
import { useRef, useState } from "react";
import {
  Plus,
  Play,
  Save,
  Download,
  Upload,
  Trash2,
  ArrowUp,
  ArrowDown,
  Braces,
} from "lucide-react";
import { PageTitle } from "@/components/shell";
import { CodeEditor } from "@/components/editor";
import { Empty, ExecutionResult, Loading, Notice } from "@/components/ui";
import { api, apiUrl } from "@/lib/api";
import { useLoad, useTask } from "@/lib/hooks";
import { useSaveRevision } from "@/lib/save-revision";
import type { Notebook, Execution } from "@/types";
export default function PythonPage() {
  const { data, error, loading, reload } = useLoad<Notebook[]>("/notebooks");
  const task = useTask();
  const [notebook, setNotebook] = useState<Notebook>();
  const [execution, setExecution] = useState<Execution>();
  const revision = useSaveRevision();
  const dirty = revision.dirty;
  const input = useRef<HTMLInputElement>(null);
  function open(n: Notebook) {
    if (dirty && !confirm("Discard unsaved notebook edits?")) return;
    setNotebook(n);
    setExecution(undefined);
    revision.reset();
  }
  function edit(n: Notebook) {
    setNotebook(n);
    revision.edited();
  }
  async function save() {
    if (!notebook) return;
    const token = revision.begin();
    try {
      const saved = await api<Notebook>(`/notebooks/${notebook.id}`, "PUT", {
        name: notebook.name,
        cells: notebook.cells,
      });
      const completion = revision.complete(token);
      if (completion.current) setNotebook(saved);
      await reload();
      return saved;
    } catch (error) {
      revision.failed(token);
      throw error;
    }
  }

  async function run(index?: number) {
    const saved = await save();
    if (!saved) return;
    setExecution(
      await api<Execution>("/python/run", "POST", {
        notebook_id: saved.id,
        cell_index: index ?? null,
      }),
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="CODE & EXPLORE"
        title="Python Lab"
        description="Small experiments. Reproducible analysis. Real Python."
        actions={
          <>
            <button disabled={task.busy} onClick={() => input.current?.click()}>
              <Upload size={15} /> Import .ipynb
            </button>
            <button
              className="primary"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  if (dirty && !confirm("Discard unsaved edits?")) return;
                  const n = await api<Notebook>("/notebooks", "POST", {
                    name: "Untitled analysis",
                    cells: [
                      {
                        source:
                          'import pandas as pd\nimport numpy as np\n\nprint("Hello, DataForge!")\n# Uploaded files are available in DATASET_DIR',
                      },
                    ],
                  });
                  setNotebook(n);
                  revision.reset();
                  setExecution(undefined);
                  await reload();
                })
              }
            >
              <Plus size={16} /> New notebook
            </button>
          </>
        }
      />
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".ipynb"
        aria-label="Import notebook"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (
            file &&
            dirty &&
            !confirm("Import this notebook and discard unsaved edits?")
          ) {
            e.target.value = "";
            return;
          }
          if (file)
            void task.run(async () => {
              const form = new FormData();
              form.append("file", file);
              const n = await api<Notebook>("/notebooks/import", "POST", form);
              setNotebook(n);
              revision.reset();
              setExecution(undefined);
              await reload();
            }, "Imported code cells. Markdown and outputs are not imported.");
          e.target.value = "";
        }}
      />
      <Notice error={error || task.error} message={task.message} />
      <div className="workspace-grid">
        <aside className="panel resource-list">
          <div className="panel-heading">
            <h2>Notebooks</h2>
            <span className="count-pill">{data?.length ?? 0}</span>
          </div>
          {loading && !data ? (
            <Loading />
          ) : data?.length ? (
            data.map((n) => (
              <button
                key={n.id}
                className={`resource-item ${notebook?.id === n.id ? "selected" : ""}`}
                disabled={task.busy}
                onClick={() => open(n)}
              >
                <Braces size={16} />
                <span>
                  {n.name}
                  <small>{n.cells.length} code cells</small>
                </span>
              </button>
            ))
          ) : (
            <Empty>Create your first notebook.</Empty>
          )}
        </aside>
        <div className="workspace-main">
          {notebook ? (
            <>
              <section className="panel">
                <div className="notebook-toolbar">
                  <label className="grow">
                    Notebook name
                    <input
                      aria-label="Notebook name"
                      value={notebook.name}
                      maxLength={160}
                      onChange={(e) =>
                        edit({ ...notebook, name: e.target.value })
                      }
                    />
                  </label>
                  <span className="muted tiny">{revision.status}</span>
                  <button
                    disabled={task.busy}
                    onClick={() =>
                      task.run(async () => {
                        await save();
                      })
                    }
                  >
                    <Save size={14} /> Save
                  </button>
                  <button
                    className="primary"
                    disabled={task.busy}
                    onClick={() => task.run(() => run())}
                  >
                    <Play size={14} /> {task.busy ? "Working…" : "Run all"}
                  </button>
                  <button
                    aria-label="Export saved notebook"
                    title="Save and export notebook"
                    disabled={task.busy}
                    onClick={() =>
                      task.run(async () => {
                        const n = await save();
                        if (n)
                          window.location.href = apiUrl(
                            `/notebooks/${n.id}/export`,
                          );
                      })
                    }
                  >
                    <Download size={15} />
                  </button>
                  <button
                    aria-label="Delete notebook"
                    className="danger"
                    disabled={task.busy}
                    onClick={() =>
                      task.run(async () => {
                        if (!confirm("Delete this notebook?")) return;
                        await api(`/notebooks/${notebook.id}`, "DELETE");
                        setNotebook(undefined);
                        revision.reset();
                        await reload();
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="info-strip">
                  Trusted local Python · Run cell replays cells 1 through the
                  selected cell · Fresh process on every run
                </div>
              </section>
              {notebook.cells.map((cell, i) => (
                <section className="panel cell" key={`${notebook.id}-${i}`}>
                  <div className="cell-header">
                    <span className="mono muted">[{i + 1}]</span>
                    <span className="tiny">PYTHON</span>
                    <div className="row">
                      <button
                        className="icon-button"
                        disabled={i === 0 || task.busy}
                        aria-label="Move cell up"
                        onClick={() => {
                          const cells = [...notebook.cells];
                          [cells[i - 1], cells[i]] = [cells[i], cells[i - 1]];
                          edit({ ...notebook, cells });
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={i === notebook.cells.length - 1 || task.busy}
                        aria-label="Move cell down"
                        onClick={() => {
                          const cells = [...notebook.cells];
                          [cells[i + 1], cells[i]] = [cells[i], cells[i + 1]];
                          edit({ ...notebook, cells });
                        }}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={task.busy}
                        aria-label="Delete cell"
                        onClick={() =>
                          edit({
                            ...notebook,
                            cells: notebook.cells.filter(
                              (_, index) => index !== i,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        className="small"
                        disabled={task.busy}
                        onClick={() => task.run(() => run(i))}
                      >
                        <Play size={12} /> Run cell
                      </button>
                    </div>
                  </div>
                  <CodeEditor
                    value={cell.source}
                    language="python"
                    onChange={(source) =>
                      edit({
                        ...notebook,
                        cells: notebook.cells.map((c, index) =>
                          index === i ? { source } : c,
                        ),
                      })
                    }
                  />
                </section>
              ))}
              <button
                className="add-cell"
                disabled={task.busy || notebook.cells.length >= 100}
                onClick={() =>
                  edit({
                    ...notebook,
                    cells: [...notebook.cells, { source: "" }],
                  })
                }
              >
                <Plus size={16} /> Add code cell
              </button>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Execution output</h2>
                  {task.busy && (
                    <span role="status" className="muted">
                      Working…
                    </span>
                  )}
                </div>
                <ExecutionResult execution={execution} />
              </section>
            </>
          ) : (
            <section className="panel">
              <Empty>
                Open a notebook or create one to start writing Python.
              </Empty>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
