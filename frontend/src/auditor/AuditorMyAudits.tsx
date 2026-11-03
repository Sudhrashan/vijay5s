import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { useServerCycle } from "../lib/cycle";
import type { Audit, AuditsResponse } from "../api/types";
import { fmtDateTime } from "../lib/format";

const GROUPS: { label: string; match: (a: Audit) => boolean; badge: string; text: string }[] = [
  { label: "To do", match: (a) => a.status === "Due today" || a.status === "Scheduled", badge: "a-badge-pending", text: "Pending" },
  { label: "Missed", match: (a) => a.status === "Missed", badge: "a-badge-pending", text: "Missed" },
  { label: "Completed", match: (a) => a.status === "Completed", badge: "a-badge-done", text: "Done" },
];

export default function AuditorMyAudits() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { cycle, isLoading: metaLoading } = useServerCycle();
  const { data, isLoading, error } = useQuery({
    queryKey: ["audits", cycle],
    queryFn: () => api.get<AuditsResponse>("/audits", { cycle }),
    enabled: !!cycle,
  });

  if (metaLoading || (cycle && isLoading)) return <div className="a-loading">Loading…</div>;
  if (error) return <div className="a-loading a-error">Could not load your audits. Check your connection, then try again.</div>;

  const mine = (data?.items ?? []).filter((a) => a.auditors.some((u) => u.id === user?.id));

  return (
    <div className="a-page">
      <header className="a-header">
        <div className="a-header-left"><h1 className="a-header-title">My Audits</h1></div>
      </header>
      <main className="a-main">
        {mine.length === 0 && <div className="a-card" style={{ textAlign: "center", color: "var(--a-on-surface-variant)" }}>No audits assigned to you this cycle.</div>}
        {GROUPS.map((g) => {
          const rows = mine.filter(g.match);
          if (!rows.length) return null;
          return (
            <section key={g.label} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 className="a-section-label">{g.label} ({rows.length})</h3>
              <div className="a-zone-list">
                {rows.map((a) => {
                  const done = a.status === "Completed";
                  return (
                    <button key={a.id} className="a-zone-btn" onClick={() => nav(done ? `/audit/${a.id}/summary` : `/audit/${a.id}`)}>
                      <div className="a-zone-left">
                        <span className="material-symbols-outlined" style={{ color: "var(--a-primary-container)", fontSize: 24 }}>factory</span>
                        <div>
                          <h4 className="a-zone-name">{a.zone}</h4>
                          <p className="a-zone-sub">
                            {done && a.completed_at
                              ? `Done by ${a.submitted_by_id === user?.id ? "you" : a.submitted_by} · ${fmtDateTime(a.completed_at)}`
                              : `Planned ${new Date(a.planned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className={`a-badge ${g.badge}`}>{g.text}</span>
                        <span className="material-symbols-outlined" style={{ color: "var(--a-on-surface-variant)" }}>chevron_right</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
