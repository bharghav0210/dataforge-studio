"use client";
import { useState } from "react";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { PageTitle } from "@/components/shell";
import { Activity, Empty, Loading, Notice } from "@/components/ui";
import { useLoad } from "@/lib/hooks";
import type { Execution } from "@/types";
export default function HistoryPage() {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const records = useLoad<Execution[]>(
    `/executions?kind=${kind}&status=${status}&offset=${offset}&limit=25`,
  );
  return (
    <>
      <PageTitle
        eyebrow="A RECORD OF REAL WORK"
        title="Execution history"
        description="Every run has a story. Inspect the output, timing, and errors."
        actions={
          <button onClick={records.reload} disabled={records.loading}>
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />
      <Notice error={records.error} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Execution log</h2>
          <div className="row">
            <select
              aria-label="Filter execution type"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All types</option>
              <option value="python">Python</option>
              <option value="sql">SQL</option>
              <option value="etl">ETL</option>
            </select>
            <select
              aria-label="Filter execution status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
            </select>
          </div>
        </div>
        {records.loading ? (
          <Loading />
        ) : records.error ? (
          <Empty>Execution results unavailable. Use Refresh to retry.</Empty>
        ) : !records.data?.length ? (
          <Empty>No executions match these filters.</Empty>
        ) : (
          <Activity executions={records.data} />
        )}
        <div className="table-foot row spread">
          <span>
            Showing {offset + (records.data?.length ? 1 : 0)}–
            {offset + (records.data?.length || 0)}
          </span>
          <div className="row">
            <button
              aria-label="Previous page"
              disabled={!offset || records.loading}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              aria-label="Next page"
              disabled={(records.data?.length || 0) < 25 || records.loading}
              onClick={() => setOffset(offset + 25)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
