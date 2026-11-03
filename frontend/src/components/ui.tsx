"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  AlertCircle,
  ChevronRight,
  Download,
  Inbox,
} from "lucide-react";
import type { Execution, Preview } from "@/types";
import { apiUrl } from "@/lib/api";
export function Notice({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          <CheckCircle2 size={16} />
          {message}
        </div>
      )}
    </>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      {status === "success" ? (
        <CheckCircle2 size={12} />
      ) : status === "running" ? (
        <Clock3 size={12} />
      ) : (
        <AlertCircle size={12} />
      )}{" "}
      {status}
    </span>
  );
}
export function DataTable({ data }: { data: Preview }) {
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {data.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                {data.columns.map((c) => (
                  <td key={c}>
                    {r[c] === null ? (
                      <span className="null">null</span>
                    ) : (
                      String(r[c] ?? "")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        {data.row_count.toLocaleString()} rows
        {data.truncated ? " · preview capped" : ""} · {data.columns.length}{" "}
        columns
      </div>
    </>
  );
}
export function ExecutionResult({ execution }: { execution?: Execution }) {
  if (!execution) return <Empty>Run your work to see output here.</Empty>;
  const result = execution.result;
  return (
    <div className="execution-output">
      <div className="row spread">
        <Badge status={execution.status} />
        <span className="muted">
          {execution.duration_ms?.toFixed(1) ?? "—"} ms ·{" "}
          {execution.id.slice(0, 8)}
        </span>
        {execution.status === "success" &&
        (execution.output_reference || result?.columns?.length) ? (
          <a
            className="button small"
            href={apiUrl(`/executions/${execution.id}/download`)}
          >
            <Download size={14} /> CSV
          </a>
        ) : null}
      </div>
      <Notice error={execution.error || ""} />
      {result?.replayed_cells && (
        <p className="muted">
          Replayed {result.replayed_cells} cells in a fresh process.
        </p>
      )}
      {result?.stdout !== undefined && (
        <pre className="console">{result.stdout || "(no stdout)"}</pre>
      )}
      {result?.stderr && <pre className="console stderr">{result.stderr}</pre>}
      {result?.columns && result.rows && (
        <DataTable data={result as Preview} />
      )}{" "}
      {result?.table && (
        <p className="muted">
          Written to table <code>{result.table}</code>
        </p>
      )}
      {result?.input_rows !== undefined && (
        <p className="muted">
          {result.input_rows} input rows → {result.output_rows} output rows
        </p>
      )}
    </div>
  );
}
export function Activity({ executions }: { executions: Execution[] }) {
  const [selected, setSelected] = useState<Execution>();
  return (
    <>
      {executions.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Execution / resource</th>
                <th>Type</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Started</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.id}>
                  <td>
                    <button
                      className="text-button resource"
                      onClick={() => setSelected(e)}
                    >
                      {e.resource_name}
                    </button>
                    <div className="tiny muted">{e.id.slice(0, 8)}</div>
                  </td>
                  <td>
                    <span className="kind">{e.kind}</span>
                  </td>
                  <td>
                    <Badge status={e.status} />
                  </td>
                  <td>{e.duration_ms?.toFixed(0) ?? "—"} ms</td>
                  <td className="muted">
                    {new Date(e.started_at).toLocaleString()}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label="Inspect execution"
                      onClick={() => setSelected(e)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          No executions yet. Run Python, SQL, or a pipeline to start your
          history.
        </Empty>
      )}
      {selected && (
        <ExecutionDialog
          execution={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}
function ExecutionDialog({
  execution,
  onClose,
}: {
  execution: Execution;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element?.showModal();
    return () => {
      element?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="row spread">
        <h2 id={title}>Execution detail</h2>
        <button autoFocus onClick={onClose}>
          Close
        </button>
      </div>
      <p>{execution.resource_name}</p>
      <p className="muted">
        Started {new Date(execution.started_at).toLocaleString()}
        <br />
        Completed{" "}
        {execution.completed_at
          ? new Date(execution.completed_at).toLocaleString()
          : "pending"}
      </p>
      {execution.result?.sql && (
        <pre className="console">{execution.result.sql}</pre>
      )}
      <ExecutionResult execution={execution} />
    </dialog>
  );
}

export function DurationChart({ executions }: { executions: Execution[] }) {
  const runs = [...executions].filter((e) => e.duration_ms !== null).reverse();
  if (!runs.length) return null;
  const maximum = Math.max(...runs.map((e) => e.duration_ms || 0), 1);
  return (
    <section className="panel duration-panel">
      <div className="panel-heading">
        <h2>Recent execution duration</h2>
        <span className="tiny muted">
          MEASURED WALL TIME · LATEST {runs.length} RUNS
        </span>
      </div>
      <div
        className="duration-chart"
        role="img"
        aria-label={runs
          .map(
            (e) =>
              `${e.kind} ${e.resource_name}: ${e.duration_ms} milliseconds, ${e.status}`,
          )
          .join("; ")}
      >
        {runs.map((e) => (
          <div
            key={e.id}
            className="duration-column"
            title={`${e.resource_name}: ${e.duration_ms} ms`}
          >
            <span>{e.duration_ms?.toFixed(0)} ms</span>
            <div className="duration-track">
              <div
                className={`duration-bar ${e.status}`}
                style={{
                  height: `${Math.max(3, ((e.duration_ms || 0) / maximum) * 100)}%`,
                }}
              />
            </div>
            <small>{e.kind.toUpperCase()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
