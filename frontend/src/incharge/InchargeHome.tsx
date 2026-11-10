import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { useServerCycle } from "../lib/cycle";
import { auditPill, submittedLine } from "../lib/format";
import PhotoViewer from "./PhotoViewer";
import type { Audit, AuditsResponse, Finding, Issue } from "../api/types";

type FilterKey = "All" | "Open" | "Closed" | "Overdue";
const FILTERS: FilterKey[] = ["All", "Open", "Closed", "Overdue"];

/** Read-only block showing one audit's live findings (photo + category + remark), for the
 * 5S Incharge — same visual pattern as Audits.tsx's AuditModal / AuditorCapture.tsx. */
function ZoneAuditFindings({ audit }: { audit: Audit }) {
  const { data, isLoading } = useQuery({
    queryKey: ["findings", audit.id],
    queryFn: () => api.get<{ items: Finding[] }>(`/audits/${audit.id}/findings`),
  });
  const findings = data?.items ?? [];
  const nav = useNavigate();
  const [view, setView] = useState<Finding | null>(null);

  return (
    <div className="i-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className={`i-badge ${auditPill(audit.status) === "p-green" ? "i-badge-closed" : "i-badge-open"}`}>
          {audit.status}
        </span>
        <span className="i-section-label">{findings.length} finding{findings.length === 1 ? "" : "s"}</span>
      </div>
      {audit.submitted_by && (
        <p className="i-issue-sub" style={{ marginBottom: 8 }}>Submitted by {submittedLine(audit)}</p>
      )}
      {isLoading && <div className="i-issue-sub">Loading findings…</div>}
      {!isLoading && findings.length === 0 && <div className="i-issue-sub">No findings logged yet.</div>}
      {!isLoading && findings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {findings.map((f) => {
            const closed = f.issue_status === "Closed";
            return (
              <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingBottom: 10, borderBottom: "1px solid var(--i-surface-container-highest)" }}>
                <button aria-label="Open photo" onClick={() => setView(f)} style={{ padding: 0, border: 0, background: "none", flexShrink: 0 }}>
                  <img src={f.photo_url} alt="Finding" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--i-outline-variant)", display: "block" }} />
                </button>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="i-badge i-badge-open" style={{ background: "rgba(11,95,165,0.12)", color: "var(--i-primary-container)" }}>{f.category}</span>
                    {f.issue_status && <span className={`i-badge ${closed ? "i-badge-closed" : "i-badge-open"}`}>{closed ? "Closed" : "Open"}</span>}
                  </div>
                  <p style={{ margin: "4px 0 6px", fontSize: 13 }}>{f.remark}</p>
                  {f.issue_id && !closed && (
                    <button className="i-btn-primary" style={{ padding: "8px 12px", fontSize: 13, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                      onClick={() => nav(`/issue/${f.issue_id}`)}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>photo_camera</span>Close with photo
                    </button>
                  )}
                  {f.issue_id && closed && (
                    <button onClick={() => nav(`/issue/${f.issue_id}/verify`)}
                      style={{ border: 0, background: "none", padding: 0, color: "var(--i-primary-container)", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--i-green)" }}>check_circle</span>See before and after
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {view && <PhotoViewer src={view.photo_url} caption={`${view.category} � ${view.remark}`} onClose={() => setView(null)} />}
    </div>
  );
}

export default function InchargeHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("All");

  const { data, isLoading, error } = useQuery({
    queryKey: ["issues", "zone", user?.zone_id],
    queryFn: () => api.get<{ total: number; items: Issue[] }>("/issues", { zone_id: user?.zone_id }),
    enabled: !!user?.zone_id,
  });

  const { cycle } = useServerCycle();
  const { data: auditsData, isLoading: auditsLoading } = useQuery({
    queryKey: ["audits", cycle],
    queryFn: () => api.get<AuditsResponse>("/audits", { cycle }),
    enabled: !!cycle && !!user?.zone_id,
  });
  const zoneAudits = (auditsData?.items ?? []).filter((a) => a.zone_id === user?.zone_id);

  const items = data?.items ?? [];
  const open = items.filter((i) => i.status === "Open");
  const closed = items.filter((i) => i.status === "Closed");
  // The mockup's three buckets (Open / In progress / Closed) collapse to the two statuses the
  // API actually has — an issue with escalation_level > 0 counts as "in progress" (already escalated,
  // being chased), still part of `open` for totals.
  const inProgress = open.filter((i) => i.escalation_level > 0);

  const filtered = useMemo(() => {
    switch (filter) {
      case "Open": return open;
      case "Closed": return closed;
      case "Overdue": return open.filter((i) => i.days > 0 && i.escalation_level > 0);
      default: return items;
    }
  }, [filter, items, open, closed]);

  if (!user?.zone_id) return <div className="i-loading i-error">Your account has no zone assigned. Contact your administrator.</div>;
  if (isLoading) return <div className="i-loading">Loading…</div>;
  if (error) return <div className="i-loading i-error">Could not load issues. Check your connection, then pull down to refresh.</div>;

  return (
    <div className="i-page">
      <header className="i-header">
        <span style={{ width: 40 }} />
        <h1 className="i-header-title">Vijay 5S Audit</h1>
        <button className="i-header-icon-btn" aria-label="Notifications">
          <span className="material-symbols-outlined">notifications</span>
        </button>
      </header>

      <main className="i-main">
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>My Zone — {user.zone}</h2>

        <div className="i-summary-card">
          <div className="i-summary-stat">
            <span className="i-summary-value" style={{ color: "var(--i-red)" }}>{open.length}</span>
            <span className="i-summary-label">Open</span>
          </div>
          <div className="i-summary-divider" />
          <div className="i-summary-stat">
            <span className="i-summary-value" style={{ color: "var(--i-amber)" }}>{inProgress.length}</span>
            <span className="i-summary-label">In progress</span>
          </div>
          <div className="i-summary-divider" />
          <div className="i-summary-stat">
            <span className="i-summary-value" style={{ color: "var(--i-green)" }}>{closed.length}</span>
            <span className="i-summary-label">Closed</span>
          </div>
        </div>

        <div>
          <div className="i-section-label" style={{ marginBottom: 8 }}>This cycle's audit findings</div>
          {auditsLoading && <div className="i-card i-empty">Loading…</div>}
          {!auditsLoading && zoneAudits.length === 0 && (
            <div className="i-card i-empty">No audit scheduled for your zone this cycle.</div>
          )}
          {!auditsLoading && zoneAudits.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {zoneAudits.map((a) => <ZoneAuditFindings key={a.id} audit={a} />)}
            </div>
          )}
        </div>

        <div className="i-filter-row">
          {FILTERS.map((f) => (
            <button key={f} className={`i-filter-chip ${f === filter ? "i-filter-chip-active" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>

        <div className="i-issue-list">
          {filtered.length === 0 && <div className="i-card i-empty">No issues match this filter.</div>}
          {filtered.map((i) => {
            const overdue = i.status === "Open" && i.days > 0 && i.escalation_level > 0;
            return (
              <button key={i.id} className="i-issue-card" onClick={() => nav(i.status === "Closed" ? `/issue/${i.id}/verify` : `/issue/${i.id}`)}>
                {overdue && <div className="i-issue-overdue-bar" />}
                {i.before_photo ? (
                  <img className="i-issue-thumb" src={i.before_photo} alt={i.description} />
                ) : (
                  <div className="i-issue-thumb-empty">
                    <span className="material-symbols-outlined">image_not_supported</span>
                  </div>
                )}
                <div className="i-issue-body">
                  <h3 className="i-issue-title">{i.category} — {i.description}</h3>
                  <p className="i-issue-sub">Raised by {i.raised_by} • {i.raised_on}</p>
                  <p className="i-issue-sub">{i.zone}</p>
                </div>
                <div className="i-issue-meta">
                  <span className={`i-badge ${i.status === "Open" ? "i-badge-open" : "i-badge-closed"}`}>{i.status}</span>
                  {overdue && <span className="i-overdue-tag">OVERDUE {i.days}d</span>}
                  <span className="material-symbols-outlined" style={{ color: "var(--i-on-surface-variant)", marginTop: "auto" }}>chevron_right</span>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
