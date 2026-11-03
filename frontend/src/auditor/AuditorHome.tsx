import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { useServerCycle } from "../lib/cycle";
import type { Audit, AuditsResponse } from "../api/types";
import { fmtDateTime } from "../lib/format";

export default function AuditorHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { cycle, isLoading: metaLoading, error: metaError } = useServerCycle();

  const { data, isLoading, error } = useQuery({
    queryKey: ["audits", cycle],
    queryFn: () => api.get<AuditsResponse>("/audits", { cycle }),
    enabled: !!cycle,
  });

  if (metaLoading || (cycle && isLoading)) return <div className="a-loading">Loading…</div>;
  if (error || metaError) return <div className="a-loading a-error">Could not load your audits. Check your connection, then pull down to refresh.</div>;

  const mine: Audit[] = (data?.items ?? []).filter((a) => a.auditors.some((u) => u.id === user?.id));
  const pending = mine.filter((a) => a.status === "Scheduled" || a.status === "Due today");
  const completed = mine.filter((a) => a.status === "Completed");
  const zoneCount = new Set(mine.map((a) => a.zone_id)).size;

  // Label from the server cycle (YYYY-MM), not the phone clock.
  const [cy, cm] = (cycle ?? "").split("-").map(Number);
  const monthLabel = cy && cm
    ? new Date(cy, cm - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="a-page">
      <header className="a-header">
        <div className="a-header-left">
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>VIJAY</span>
          <h1 className="a-header-title">5S Audit</h1>
        </div>
        <button className="a-header-icon-btn" aria-label="Notifications">
          <span className="material-symbols-outlined">notifications</span>
        </button>
      </header>

      <main className="a-main">
        <section className="a-card">
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Welcome, {user?.name}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--a-on-surface-variant)", fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
            <span>{monthLabel} Audit Cycle</span>
          </div>
        </section>

        <section className="a-stats-grid">
          <div className="a-stat">
            <span className="a-stat-value" style={{ color: "var(--a-amber)" }}>{pending.length}</span>
            <span className="a-stat-label">Pending</span>
          </div>
          <div className="a-stat">
            <span className="a-stat-value" style={{ color: "var(--a-success)" }}>{completed.length}</span>
            <span className="a-stat-label">Completed</span>
          </div>
          <div className="a-stat">
            <span className="a-stat-value" style={{ color: "var(--a-primary-container)" }}>{zoneCount}</span>
            <span className="a-stat-label">Zones</span>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 className="a-section-label">Assigned zones</h3>
          <div className="a-zone-list">
            {mine.length === 0 && <div className="a-card" style={{ textAlign: "center", color: "var(--a-on-surface-variant)" }}>No audits assigned this cycle.</div>}
            {mine.map((a) => {
              const done = a.status === "Completed";
              return (
                <button key={a.id} className="a-zone-btn" onClick={() => nav(done ? `/audit/${a.id}/summary` : `/audit/${a.id}`)}>
                  <div className="a-zone-left">
                    <span className="material-symbols-outlined" style={{ color: "var(--a-primary-container)", fontSize: 24 }}>
                      factory
                    </span>
                    <div>
                      <h4 className="a-zone-name">{a.zone}</h4>
                      <p className="a-zone-sub">
                        {done && a.submitted_by
                          ? `Done by ${a.submitted_by_id === user?.id ? "you" : a.submitted_by}${a.completed_at ? ` · ${fmtDateTime(a.completed_at)}` : ""}`
                          : `Planned ${new Date(a.planned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className={`a-badge ${done ? "a-badge-done" : "a-badge-pending"}`}>{done ? "Done" : "Pending"}</span>
                    <span className="material-symbols-outlined" style={{ color: "var(--a-on-surface-variant)" }}>chevron_right</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {pending.length > 0 && (
          <button className="a-btn-primary" onClick={() => nav(`/audit/${pending[0].id}`)}>
            Start Audit
          </button>
        )}
      </main>
    </div>
  );
}
