import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useServerCycle } from "../lib/cycle";
import { submittedLine } from "../lib/format";
import type { Audit, AuditResponse, AuditsResponse, CheckpointsResponse } from "../api/types";

const CATEGORIES = ["1S", "2S", "3S", "4S", "5S"] as const;

export default function AuditorSummary() {
  const { auditId } = useParams();
  const id = Number(auditId);
  const nav = useNavigate();

  const { cycle, isLoading: metaLoading } = useServerCycle();
  const { data: auditsData, isLoading: auditsQueryLoading } = useQuery({
    queryKey: ["audits", cycle],
    queryFn: () => api.get<AuditsResponse>("/audits", { cycle }),
    enabled: !!cycle,
  });
  const auditsLoading = metaLoading || (!!cycle && auditsQueryLoading);
  const audit: Audit | undefined = auditsData?.items.find((a) => a.id === id);

  const { data: respData, isLoading: respLoading, error } = useQuery({
    queryKey: ["audit-responses", id],
    queryFn: () => api.get<{ items: AuditResponse[] }>(`/audits/${id}/responses`),
    enabled: !!id,
  });
  const { data: cpData } = useQuery({ queryKey: ["checkpoints"], queryFn: () => api.get<CheckpointsResponse>("/checkpoints") });

  if (auditsLoading || respLoading) return <div className="a-loading">Loading summary…</div>;
  if (error) return <div className="a-loading a-error">This audit has not been submitted yet. Go back and finish the checklist first.</div>;

  const responses = respData?.items ?? [];
  const totalCheckpoints = cpData?.items.length ?? responses.length;

  const byCategory = CATEGORIES.map((cat) => {
    const inCat = responses.filter((r) => r.category === cat);
    const max = inCat.length * 2;
    const sum = inCat.reduce((s, r) => s + r.score, 0);
    const pct = max > 0 ? Math.round((sum / max) * 100) : 0;
    return { cat, sum, max, pct };
  });

  return (
    <div className="a-page">
      <header className="a-header">
        <div className="a-header-left">
          <button className="a-back-btn" aria-label="Go back" onClick={() => nav("/")}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="a-header-title">Audit Dashboard</h1>
        </div>
        <span style={{ color: "#fff", fontWeight: 900, letterSpacing: "-0.02em" }}>VIJAY</span>
      </header>

      <main className="a-main">
        <section className="a-card">
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{audit?.zone ?? "Zone"}</h2>
            <p style={{ fontSize: 13, color: "var(--a-outline)", margin: "4px 0 0" }}>
              {audit ? new Date(audit.planned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}
            </p>
          </div>
          <div style={{ marginTop: 16 }}>
            <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{audit?.score ?? "—"}%</span>
            <div className="a-section-label" style={{ marginTop: 4 }}>OVERALL 5S SCORE ({responses.length}/{totalCheckpoints} checkpoints)</div>
          </div>
          {audit?.submitted_by && (
            <p style={{ fontSize: 13, color: "var(--a-on-surface-variant)", margin: "12px 0 0" }}>
              Submitted by {submittedLine(audit)}
            </p>
          )}
        </section>

        <section className="a-card">
          <h3 className="a-section-label" style={{ marginBottom: 8, display: "block" }}>By 5S category</h3>
          {byCategory.map(({ cat, pct, sum, max }) => (
            <div className="a-cat-row" key={cat}>
              <span style={{ width: 24, fontWeight: 600, fontSize: 13 }}>{cat}</span>
              <div className="a-cat-track"><div className="a-cat-fill" style={{ width: `${pct}%` }} /></div>
              <span style={{ width: 48, textAlign: "right", fontSize: 13, fontWeight: 600 }}>{sum}/{max}</span>
            </div>
          ))}
        </section>
      </main>

      <div className="a-footer-fixed">
        <p style={{ fontSize: 13, color: "var(--a-outline)", textAlign: "center", margin: 0 }}>
          This audit has been recorded for {audit?.zone ?? "this zone"}.
        </p>
        <button className="a-btn-primary" onClick={() => nav("/")}>Back to Home</button>
      </div>
    </div>
  );
}
