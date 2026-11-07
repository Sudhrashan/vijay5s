import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { useServerCycle } from "../lib/cycle";
import type { Report } from "../api/types";

const CATK = ["1S", "2S", "3S", "4S", "5S"] as const;
const CAT_LABELS: Record<string, string> = {
  "1S": "1S Sort", "2S": "2S Set in order", "3S": "3S Shine", "4S": "4S Standardize", "5S": "5S Sustain",
};
const CAT_COLORS: Record<string, string> = {
  "1S": "var(--i-red)", "2S": "var(--i-amber)", "3S": "var(--i-primary-container)",
  "4S": "var(--i-primary-container)", "5S": "var(--i-primary-container)",
};

/** "2026-01" -> "2025-12" (same arithmetic as backend stats.shift(cycle, -1)). */
function prevCycle(cycle: string): string {
  const [y, m] = cycle.split("-").map(Number);
  const idx = y * 12 + (m - 1) - 1;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export default function InchargeReports() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { cycle, isLoading: metaLoading, error: metaError } = useServerCycle();

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "zone", user?.zone_id, cycle],
    // Admin Reports uses cycle keys (YYYY-MM) for frm/to, not calendar dates — the backend's
    // report() treats frm/to as cycles and expands month-by-month, so frm=to=current cycle
    // scopes to just this month, matching stats.current_cycle()'s convention. The query param
    // is "frm" (not "from", a reserved word in Python) — see backend/app/api/routes/reports.py.
    // frm is one cycle earlier so months[] holds [previous, current] and the closure trend works.
    queryFn: () => api.get<Report>("/reports", { frm: prevCycle(cycle!), to: cycle, zone_id: user?.zone_id }),
    enabled: !!user?.zone_id && !!cycle,
  });

  if (!user?.zone_id) return <div className="i-loading i-error">Your account has no zone assigned. Contact your administrator.</div>;
  if (metaLoading || (cycle && isLoading)) return <div className="i-loading">Loading…</div>;
  if (error || metaError || !data) return <div className="i-loading i-error">Could not load the report. Check your connection, then pull down to refresh.</div>;

  const current = data.months[data.months.length - 1];
  const prev = data.months.length > 1 ? data.months[data.months.length - 2] : null;
  const closureRate = current.raised > 0 ? Math.round((current.closed / current.raised) * 100) : 0;
  const prevClosureRate = prev && prev.raised > 0 ? Math.round((prev.closed / prev.raised) * 100) : null;
  const trendDelta = prevClosureRate !== null ? closureRate - prevClosureRate : null;
  const maxCat = Math.max(1, ...current.fcat);
  const monthLabel = current.label;

  return (
    <div className="i-page">
      <header className="i-header">
        <button className="i-back-btn" aria-label="Go back" onClick={() => nav("/")}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="i-header-title">{monthLabel} Report</h1>
        <span style={{ width: 40 }} />
      </header>

      <main className="i-main">
        <section className="i-card">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "1px solid var(--i-surface-container-highest)", paddingBottom: 12, marginBottom: 12 }}>
            <span className="i-report-label">Overall closure rate</span>
            <span className="i-report-value" style={{ fontSize: 36, color: "var(--i-tertiary-container)" }}>{closureRate}%</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, textAlign: "center" }}>
            <div className="i-report-stat">
              <span className="i-report-value" style={{ color: "var(--i-primary-container)" }}>{current.raised}</span>
              <span className="i-report-label">Issues raised</span>
            </div>
            <div className="i-report-stat">
              <span className="i-report-value" style={{ color: "var(--i-tertiary-container)" }}>{current.closed}</span>
              <span className="i-report-label">Issues closed</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="i-section-label" style={{ display: "block", marginBottom: 8 }}>Audit findings by category</h2>
          <div className="i-card">
            {CATK.map((k, idx) => (
              <div className="i-cat-row" key={k}>
                <div className="i-cat-row-top">
                  <span>{CAT_LABELS[k]}</span>
                  <span>{current.fcat[idx]}</span>
                </div>
                <div className="i-cat-track">
                  <div className="i-cat-fill" style={{ width: `${Math.round((current.fcat[idx] / maxCat) * 100)}%`, background: CAT_COLORS[k] }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="i-section-label" style={{ display: "block", marginBottom: 8 }}>Closure trend</h2>
          <div className="i-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="material-symbols-outlined" style={{ color: "var(--i-tertiary-container)" }}>
                {trendDelta === null ? "trending_flat" : trendDelta >= 0 ? "trending_up" : "trending_down"}
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 500 }}>{trendDelta === null ? "No prior data" : trendDelta >= 0 ? "Upward trend" : "Downward trend"}</p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--i-on-surface-variant)" }}>{prev ? `Compared to ${prev.label}` : "This is the first month on record"}</p>
              </div>
            </div>
            {trendDelta !== null && (
              <span style={{ background: "rgba(0,108,45,0.1)", color: "var(--i-tertiary-container)", padding: "4px 12px", borderRadius: 999, fontWeight: 700 }}>
                {trendDelta >= 0 ? "+" : ""}{trendDelta}%
              </span>
            )}
          </div>
        </section>

        <section>
          <h2 className="i-section-label" style={{ display: "block", marginBottom: 8 }}>Open vs overdue</h2>
          <div className="i-card">
            <div className="i-zone-row" style={{ padding: 0 }}>
              <span>Open at month end</span>
              <span style={{ fontWeight: 700 }}>{current.open}</span>
            </div>
            <div className="i-zone-row" style={{ padding: "12px 0 0", borderTop: "1px solid var(--i-surface-container-highest)", marginTop: 12 }}>
              <span>Overdue (&gt;{data.overdue_days}d)</span>
              <span style={{ fontWeight: 700, color: current.overdue > 0 ? "var(--i-red)" : undefined }}>{current.overdue}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
