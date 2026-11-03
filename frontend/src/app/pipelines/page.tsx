"use client";
import { useState } from "react";
import {
  Plus,
  Workflow,
  Save,
  Play,
  Eye,
  Trash2,
  ArrowDown,
  ArrowUp,
  Files,
  Database,
} from "lucide-react";
import { PageTitle } from "@/components/shell";
import { DataTable, Empty, ExecutionResult, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad, useTask } from "@/lib/hooks";
import { useSaveRevision } from "@/lib/save-revision";
import type {
  Dataset,
  Execution,
  Pipeline,
  PipelineDefinition,
  Preview,
  Transform,
  Operation,
} from "@/types";
const operations: { value: Operation; label: string }[] = [
  { value: "drop_duplicates", label: "Drop duplicates" },
  { value: "select", label: "Select columns" },
  { value: "rename", label: "Rename columns" },
  { value: "fill_missing", label: "Fill missing values" },
  { value: "drop_missing", label: "Drop missing values" },
  { value: "filter", label: "Filter rows" },
];
type DraftStep = Transform & { editorId: string };
type Draft = Omit<PipelineDefinition, "steps"> & { steps: DraftStep[] };
const draft = (definition: PipelineDefinition): Draft => ({
  ...definition,
  steps: definition.steps.map((step) => ({
    ...step,
    editorId: crypto.randomUUID(),
  })),
});
const payload = (definition: Draft): PipelineDefinition => ({
  ...definition,
  steps: definition.steps.map((step) => ({
    op: step.op,
    columns: step.columns,
    mapping: step.mapping,
    column: step.column,
    value: step.value,
    condition: step.condition,
  })),
});
const blank = (): Draft =>
  draft({
    name: "Retail cleanup",
    dataset_id: "",
    destination: "csv",
    table: "processed_sales",
    steps: [{ op: "drop_duplicates" }, { op: "drop_missing" }],
  });
function StepEditor({
  step,
  onChange,
}: {
  step: Transform;
  onChange: (s: Transform) => void;
}) {
  const [columnText, setColumnText] = useState(step.columns?.join(", ") || "");
  const columnOps = ["select", "drop_duplicates", "drop_missing"].includes(
    step.op,
  );
  const [renameText, setRenameText] = useState(
    Object.entries(step.mapping || {})
      .map(([a, b]) => `${a}=${b}`)
      .join(", "),
  );
  return (
    <div className="step-fields">
      {columnOps && (
        <label>
          Columns {step.op !== "select" && "(blank = all)"}
          <input
            value={columnText}
            placeholder="region, quantity"
            onChange={(e) => {
              setColumnText(e.target.value);
              onChange({
                ...step,
                columns: e.target.value
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean),
              });
            }}
          />
        </label>
      )}
      {step.op === "rename" && (
        <label>
          Rename pairs (old=new, separated by commas)
          <input
            value={renameText}
            placeholder="price=unit_price, region=sales_region"
            onChange={(e) => {
              setRenameText(e.target.value);
              const mapping = Object.fromEntries(
                e.target.value
                  .split(",")
                  .filter((v) => v.trim())
                  .map((v) => {
                    const [a, ...b] = v.split("=");
                    return [a.trim(), b.join("=").trim()];
                  }),
              );
              onChange({ ...step, mapping });
            }}
          />
        </label>
      )}
      {["filter", "fill_missing"].includes(step.op) && (
        <>
          <label>
            Column
            <input
              value={step.column || ""}
              placeholder="quantity"
              onChange={(e) => onChange({ ...step, column: e.target.value })}
            />
          </label>
          {step.op === "filter" && (
            <label>
              Condition
              <select
                value={step.condition || "eq"}
                onChange={(e) =>
                  onChange({
                    ...step,
                    condition: e.target.value as Transform["condition"],
                  })
                }
              >
                {["eq", "ne", "gt", "gte", "lt", "lte", "contains"].map((c) => (
                  <option key={c} value={c}>
                    {
                      {
                        eq: "equals",
                        ne: "not equal",
                        gt: "greater than",
                        gte: "at least",
                        lt: "less than",
                        lte: "at most",
                        contains: "contains text",
                      }[c]
                    }
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Value
            <input
              type={typeof step.value === "number" ? "number" : "text"}
              value={step.value ?? ""}
              onChange={(e) =>
                onChange({
                  ...step,
                  value:
                    typeof step.value === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={typeof step.value === "number"}
              onChange={(e) =>
                onChange({
                  ...step,
                  value: e.target.checked
                    ? Number(step.value) || 0
                    : String(step.value ?? ""),
                })
              }
            />{" "}
            Numeric value
          </label>
        </>
      )}
    </div>
  );
}
export default function PipelinesPage() {
  const datasets = useLoad<Dataset[]>("/datasets");
  const pipelines = useLoad<Pipeline[]>("/pipelines");
  const task = useTask();
  const [definition, setDefinition] = useState<Draft>(blank);
  const [id, setId] = useState<string>();
  const [preview, setPreview] = useState<Preview>();
  const [execution, setExecution] = useState<Execution>();
  const revision = useSaveRevision(false);
  const dirty = revision.dirty;
  function edit(d: Draft) {
    setDefinition(d);
    revision.edited();
    setPreview(undefined);
    setExecution(undefined);
  }
  function newPipeline() {
    if (dirty && !confirm("Discard unsaved pipeline edits?")) return;
    setId(undefined);
    setDefinition(blank());
    revision.reset(false);
    setExecution(undefined);
    setPreview(undefined);
  }
  async function save() {
    const token = revision.begin();
    try {
      const result = await api<Pipeline>(
        id ? `/pipelines/${id}` : "/pipelines",
        id ? "PUT" : "POST",
        payload(definition),
      );
      const completion = revision.complete(token);
      if (completion.active) setId(result.id);
      if (completion.current)
        setDefinition({
          ...result.definition,
          steps: result.definition.steps.map((step, i) => ({
            ...step,
            editorId: definition.steps[i].editorId,
          })),
        });
      await pipelines.reload();
      return result;
    } catch (error) {
      revision.failed(token);
      throw error;
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="TRANSFORM & REPEAT"
        title="ETL pipelines"
        description="From raw input to reliable output. Build a flow you can run again."
        actions={
          <button
            className="primary"
            onClick={newPipeline}
            disabled={task.busy}
          >
            <Plus size={16} /> New pipeline
          </button>
        }
      />
      <Notice
        error={task.error || datasets.error || pipelines.error}
        message={task.message}
      />
      <div className="workspace-grid">
        <aside className="panel resource-list">
          <div className="panel-heading">
            <h2>Saved pipelines</h2>
            <span className="count-pill">{pipelines.data?.length ?? 0}</span>
          </div>
          {pipelines.data?.length ? (
            pipelines.data.map((p) => (
              <button
                key={p.id}
                className={`resource-item ${id === p.id ? "selected" : ""}`}
                disabled={task.busy}
                onClick={() => {
                  if (dirty && !confirm("Discard unsaved pipeline edits?"))
                    return;
                  setId(p.id);
                  setDefinition(draft(p.definition));
                  revision.reset();
                  setExecution(undefined);
                  setPreview(undefined);
                }}
              >
                <Workflow size={16} />
                <span>
                  {p.name}
                  <small>{p.definition.steps.length} transformations</small>
                </span>
              </button>
            ))
          ) : (
            <Empty>Save your first reusable pipeline.</Empty>
          )}
        </aside>
        <div className="workspace-main">
          <section className="panel pipeline-config">
            <div className="notebook-toolbar">
              <label className="grow">
                Pipeline name
                <input
                  value={definition.name}
                  maxLength={160}
                  onChange={(e) =>
                    edit({ ...definition, name: e.target.value })
                  }
                />
              </label>
              <span className="tiny muted">{revision.status}</span>
              {id && (
                <button
                  className="danger"
                  aria-label="Delete pipeline"
                  disabled={task.busy}
                  onClick={() =>
                    task.run(async () => {
                      if (
                        !confirm(
                          "Delete this pipeline configuration? Execution history and outputs will remain.",
                        )
                      )
                        return;
                      await api(`/pipelines/${id}`, "DELETE");
                      setId(undefined);
                      setDefinition(blank());
                      revision.reset(false);
                      setPreview(undefined);
                      setExecution(undefined);
                      await pipelines.reload();
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <div className="pipeline-stage">
              <div className="stage-label">
                <span className="stage-number">01</span>
                <Files size={18} />
                <h3>Source dataset</h3>
              </div>
              <label>
                Uploaded CSV or Excel
                <select
                  value={definition.dataset_id}
                  onChange={(e) =>
                    edit({ ...definition, dataset_id: e.target.value })
                  }
                >
                  <option value="">Select a dataset…</option>
                  {datasets.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.rows} rows
                    </option>
                  ))}
                </select>
              </label>
              {definition.dataset_id && (
                <p className="muted tiny">
                  Columns:{" "}
                  {datasets.data
                    ?.find((d) => d.id === definition.dataset_id)
                    ?.columns.map((c) => c.name)
                    .join(", ")}
                </p>
              )}
            </div>
            <div className="stage-connector">
              <ArrowDown size={16} />
            </div>
            <div className="pipeline-stage">
              <div className="stage-label">
                <span className="stage-number">02</span>
                <Workflow size={18} />
                <h3>Transformations</h3>
                <span className="tiny muted">EXECUTED IN ORDER</span>
              </div>
              {definition.steps.map((step, i) => (
                <div className="transform-step" key={step.editorId}>
                  <div className="row spread">
                    <span className="tiny muted">
                      STEP {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="row">
                      <button
                        className="icon-button"
                        aria-label="Move step up"
                        disabled={i === 0 || task.busy}
                        onClick={() => {
                          const steps = [...definition.steps];
                          [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                          edit({ ...definition, steps });
                        }}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Move step down"
                        disabled={
                          i === definition.steps.length - 1 || task.busy
                        }
                        onClick={() => {
                          const steps = [...definition.steps];
                          [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
                          edit({ ...definition, steps });
                        }}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label="Remove transformation"
                        disabled={task.busy}
                        onClick={() =>
                          edit({
                            ...definition,
                            steps: definition.steps.filter(
                              (_, index) => i !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <label>
                    Operation
                    <select
                      value={step.op}
                      onChange={(e) =>
                        edit({
                          ...definition,
                          steps: definition.steps.map((s, index) =>
                            index === i
                              ? {
                                  op: e.target.value as Operation,
                                  editorId: s.editorId,
                                }
                              : s,
                          ),
                        })
                      }
                    >
                      {operations.map((o) => (
                        <option value={o.value} key={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <StepEditor
                    key={step.op}
                    step={step}
                    onChange={(s) =>
                      edit({
                        ...definition,
                        steps: definition.steps.map((old, index) =>
                          i === index ? { ...s, editorId: old.editorId } : old,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <button
                className="add-cell"
                disabled={definition.steps.length >= 30 || task.busy}
                onClick={() =>
                  edit({
                    ...definition,
                    steps: [
                      ...definition.steps,
                      { op: "drop_duplicates", editorId: crypto.randomUUID() },
                    ],
                  })
                }
              >
                <Plus size={15} /> Add transformation
              </button>
            </div>
            <div className="stage-connector">
              <ArrowDown size={16} />
            </div>
            <div className="pipeline-stage">
              <div className="stage-label">
                <span className="stage-number">03</span>
                <Database size={18} />
                <h3>Destination</h3>
              </div>
              <label>
                Output format
                <select
                  value={definition.destination}
                  onChange={(e) =>
                    edit({
                      ...definition,
                      destination: e.target.value as "csv" | "sqlite",
                    })
                  }
                >
                  <option value="csv">Downloadable CSV</option>
                  <option value="sqlite">Workspace SQLite table + CSV</option>
                </select>
              </label>
              {definition.destination === "sqlite" && (
                <label>
                  Table prefix
                  <input
                    value={definition.table}
                    onChange={(e) =>
                      edit({ ...definition, table: e.target.value })
                    }
                  />
                  <small>
                    Each run adds a unique suffix to preserve existing outputs.
                  </small>
                </label>
              )}
            </div>
            <div className="pipeline-actions">
              <button
                disabled={task.busy || !definition.dataset_id}
                onClick={() =>
                  task.run(async () => {
                    setPreview(
                      await api<Preview>(
                        "/pipelines/preview",
                        "POST",
                        payload(definition),
                      ),
                    );
                  })
                }
              >
                <Eye size={15} /> Preview
              </button>
              <button
                disabled={task.busy || !definition.dataset_id}
                onClick={() =>
                  task.run(async () => {
                    await save();
                  })
                }
              >
                <Save size={15} /> Save pipeline
              </button>
              <button
                className="primary"
                disabled={task.busy || !definition.dataset_id}
                onClick={() =>
                  task.run(async () => {
                    const p = await save();
                    setExecution(
                      await api<Execution>(`/pipelines/${p.id}/run`, "POST"),
                    );
                  })
                }
              >
                <Play size={15} />
                {task.busy ? "Working…" : "Save & run"}
              </button>
            </div>
          </section>
          {preview && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Transformation preview</h2>
                <span className="muted tiny">
                  {preview.input_rows} INPUT → {preview.row_count} OUTPUT
                </span>
              </div>
              <DataTable data={preview} />
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Pipeline execution</h2>
            </div>
            <ExecutionResult execution={execution} />
          </section>
        </div>
      </div>
    </>
  );
}
