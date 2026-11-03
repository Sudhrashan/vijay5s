import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useServerCycle } from "../lib/cycle";
import { submittedLine } from "../lib/format";
import type { Audit, AuditsResponse, Finding } from "../api/types";

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

  const { data: findingsData, isLoading: findingsLoading, error } = useQuery({
    queryKey: ["findings", id],
    queryFn: () => api.get<{ items: Finding[] }>(`/audits/${id}/findings`),
    enabled: !!id,
  });

  if (auditsLoading || findingsLoading) return <div className="a-loading">Loading summary…</div>;
  if (error) return <div className="a-loading a-error">This audit has not been submitted yet. Go back and finish logging findings first.</div>;

  const findings = findingsData?.items ?? [];

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
          <div className="a-section-label" style={{ marginTop: 16 }}>{findings.length} finding{findings.length === 1 ? "" : "s"} logged</div>
          {audit?.submitted_by && (
            <p style={{ fontSize: 13, color: "var(--a-on-surface-variant)", margin: "12px 0 0" }}>
              Submitted by {submittedLine(audit)}
            </p>
          )}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 className="a-section-label">Findings</h3>
          {findings.length === 0 && <div className="a-card" style={{ textAlign: "center", color: "var(--a-on-surface-variant)" }}>No findings were logged for this audit.</div>}
          {findings.map((f) => (
            <div className="a-card" key={f.id} style={{ display: "flex", gap: 12 }}>
              <img src={f.photo_url} alt="Finding" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
              <div>
                <span className="a-chip a-chip-active" style={{ height: 24, padding: "0 10px", fontSize: 12 }}>{f.category}</span>
                <p style={{ margin: "6px 0 0", fontSize: 14 }}>{f.remark}</p>
              </div>
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
