"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  Braces,
  Database,
  Workflow,
  Files,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useLoad } from "@/lib/hooks";
import { PageTitle } from "@/components/shell";
import { Activity, Loading, Notice, DurationChart } from "@/components/ui";
import type { Dashboard } from "@/types";
const metrics = [
  ["notebooks", "Notebooks", BookOpen, "violet"],
  ["datasets", "Datasets", Files, "blue"],
  ["queries", "Saved SQL queries", Database, "amber"],
  ["pipelines", "ETL pipelines", Workflow, "teal"],
  ["success", "Successful runs", CheckCircle2, "teal"],
  ["failed", "Failed runs", AlertCircle, "rose"],
] as const;
const tools = [
  [
    "python",
    "Python Lab",
    "Explore, calculate, and turn code into insights.",
    Braces,
    "violet",
    "Open notebook workspace",
  ],
  [
    "sql",
    "SQL Lab",
    "Ask better questions of your local data.",
    Database,
    "blue",
    "Explore your database",
  ],
  [
    "pipelines",
    "ETL Pipelines",
    "Clean once. Transform. Run it again.",
    Workflow,
    "teal",
    "Build a pipeline",
  ],
] as const;
export default function DashboardPage() {
  const { data, error, loading, reload } = useLoad<Dashboard>("/dashboard");
  const completed = (data?.counts.success || 0) + (data?.counts.failed || 0);
  return (
    <>
      <PageTitle
        eyebrow="YOUR DATA, IN ONE PLACE"
        title="Workspace overview"
        description="A clear view of your work. A starting point for what’s next."
        actions={
          <>
            <button onClick={reload} disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </button>
            <Link href="/python" className="button primary">
              <Braces size={16} /> New notebook
            </Link>
          </>
        }
      />
      <Notice error={error} />
      <section className="hero">
        <div>
          <div className="row hero-label">
            <span className="online-dot" /> YOUR LOCAL DATA WORKBENCH
          </div>
          <h2>
            From raw data
            <br />
            to something meaningful<span>.</span>
          </h2>
          <p>
            Write Python. Query with SQL. Build repeatable pipelines.
            <br />
            Your entire workflow, connected in one workspace.
          </p>
          <Link href="/datasets" className="button hero-button">
            Bring your data <ArrowRight size={16} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="flow-chip chip-one">
            <Files size={22} />
            <span>INGEST</span>
          </div>
          <div className="flow-chip chip-two">
            <Braces size={22} />
            <span>EXPLORE</span>
          </div>
          <div className="flow-chip chip-three">
            <Database size={22} />
            <span>QUERY</span>
          </div>
          <div className="flow-core">
            <Workflow size={39} />
          </div>
          <div className="art-caption">YOUR WORKFLOW. CONNECTED.</div>
        </div>
      </section>
      {loading && !data ? (
        <Loading />
      ) : (
        <section className="metrics">
          {metrics.map(([key, label, Icon, color]) => (
            <div className="metric" key={key}>
              <div className="row spread">
                <span className={`metric-icon ${color}`}>
                  <Icon size={17} />
                </span>
                <span className="tiny muted">PERSISTED</span>
              </div>
              <strong>{data?.counts[key] ?? "—"}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
      )}
      <DurationChart executions={data?.recent || []} />
      <div className="section-heading">
        <h2>Your workspaces</h2>
        <span className="muted tiny">THE RIGHT TOOL FOR EVERY STEP</span>
      </div>
      <section className="tool-grid">
        {tools.map(([path, title, description, Icon, color, action]) => (
          <Link className="tool-card" key={path} href={"/" + path}>
            <div className="row spread">
              <span className={`tool-icon ${color}`}>
                <Icon size={24} />
              </span>
              <ArrowUpRight size={18} className="muted" />
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
            <div className="tool-action">
              {action}
              <ArrowRight size={14} />
            </div>
          </Link>
        ))}
      </section>
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div className="row">
            <h2>Recent activity</h2>
            <span className="count-pill">{data?.recent.length ?? 0}</span>
          </div>
          <Link href="/history" className="text-link">
            View all activity <ArrowUpRight size={14} />
          </Link>
        </div>
        <Activity executions={data?.recent || []} />
      </section>
      <div className="dashboard-bottom">
        <div className="row">
          <Sparkles size={17} />
          <span>Make every transformation count.</span>
        </div>
        <span>
          {completed} completed executions · {data?.counts.pipelines ?? 0}{" "}
          reusable pipelines
        </span>
      </div>
    </>
  );
}
