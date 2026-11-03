"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  Blocks,
  LayoutDashboard,
  Braces,
  Database,
  Workflow,
  Files,
  History,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ArrowUpRight,
  Terminal,
} from "lucide-react";
const items = [
  ["dashboard", "Overview", LayoutDashboard],
  ["python", "Python Lab", Braces],
  ["sql", "SQL Lab", Database],
  ["pipelines", "Pipelines", Workflow],
  ["datasets", "Datasets", Files],
  ["history", "Execution history", History],
  ["settings", "Settings", Settings],
] as const;
const compactQuery = "(max-width: 1000px)";
function subscribeCompact(callback: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const compactSnapshot = () => window.matchMedia(compactQuery).matches;
const serverCompactSnapshot = () => false;
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current =
    items.find(([path]) => pathname.startsWith("/" + path)) || items[0];
  const compact = useSyncExternalStore(
    subscribeCompact,
    compactSnapshot,
    serverCompactSnapshot,
  );
  const [manualCollapsed, setCollapsed] = useState<boolean | null>(null);
  const collapsed = manualCollapsed ?? compact;
  return (
    <div
      className={`app-shell ${collapsed ? "collapsed" : "sidebar-expanded"}`}
    >
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-icon">
            <Blocks size={23} />
          </span>
          <span className="brand-name">
            dataforge<span className="brand-sub">STUDIO</span>
          </span>
        </Link>
        <div className="workspace-label">
          WORKSPACE <span className="tiny">LOCAL</span>
        </div>
        <nav aria-label="Main navigation">
          {items.map(([path, title, Icon], i) => (
            <Link
              key={path}
              href={"/" + path}
              title={title}
              className={`${current[0] === path ? "active" : ""} ${i === 6 ? "settings-link" : ""}`}
            >
              <Icon size={18} />
              <span>{title}</span>
              {current[0] === path && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <Terminal size={18} />
            <div>
              Built for your next idea<p>Single-user · local workspace</p>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            <span>Collapse sidebar</span>
          </button>
          <div className="profile">
            <span className="avatar">DF</span>
            <div>
              Local developer<p>Personal workspace</p>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="row breadcrumbs">
            <Link href="/dashboard">Workspace</Link>
            <ChevronRight size={14} />
            <span>{current[1]}</span>
          </div>
          <div className="row">
            <span className="local-pill">LOCAL MVP</span>
            <a
              className="docs-link"
              href="http://localhost:8001/docs"
              target="_blank"
              rel="noreferrer"
            >
              API docs <ArrowUpRight size={13} />
            </a>
          </div>
        </header>
        <main className="content">{children}</main>
        <footer>
          DataForge Studio <span>Python · SQL · Data engineering</span>
        </footer>
      </div>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="row">{actions}</div>
    </div>
  );
}
