"use client";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { PageTitle } from "@/components/shell";
import { Loading, Notice } from "@/components/ui";
import { useLoad } from "@/lib/hooks";
import type { Settings } from "@/types";
export default function SettingsPage() {
  const settings = useLoad<Settings>("/settings");
  const d = settings.data;
  const fields = d
    ? [
        ["Application version", d.version],
        ["Backend connection", d.backend],
        ["Workspace database check", d.workspace_database],
        ["Python execution mode", d.execution_mode],
        ["Python wall timeout", `${d.python_timeout_seconds} seconds`],
        ["Python memory guardrail (Linux)", `${d.memory_limit_mb} MB`],
        ["Combined output limit", `${d.output_limit_bytes} bytes`],
        ["SQL progress timeout", `${d.sql_timeout_seconds} seconds`],
        ["Query result cap", `${d.result_row_limit} rows`],
        ["Upload size limit", `${d.upload_limit_bytes / 1024 / 1024} MB`],
        ["Local storage", d.storage_location],
      ]
    : [];
  return (
    <>
      <PageTitle
        eyebrow="LOCAL BY DESIGN"
        title="Workspace settings"
        description="Your runtime, connection details, and operating limits."
        actions={
          <button disabled={settings.loading} onClick={settings.reload}>
            <RefreshCw size={15} /> Check connection
          </button>
        }
      />
      <Notice error={settings.error} />
      {settings.loading && !d ? (
        <Loading />
      ) : (
        <section className="panel settings-panel">
          <div className="panel-heading">
            <h2>Runtime configuration</h2>
            <span className="local-pill">SINGLE-USER MVP</span>
          </div>
          <dl>
            {fields.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {d && (
        <section className="security-note">
          <ShieldAlert size={25} />
          <div>
            <h2>Trusted local execution</h2>
            <p>{d.security}</p>
            <p>
              Runtime limits reduce accidental resource exhaustion. Subprocess
              isolation does not protect your operating system from malicious
              Python.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
