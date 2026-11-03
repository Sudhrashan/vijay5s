import { useNavigate, useParams } from "react-router-dom";

export default function AuditorSuccess() {
  const { auditId } = useParams();
  const nav = useNavigate();

  return (
    <div className="a-success-wrap">
      <main className="a-success-card">
        <div className="a-success-icon-wrap">
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--a-check-green)" }}>check_circle</span>
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--a-header)", margin: "0 0 8px" }}>Audit Submitted</h1>
          <p style={{ fontSize: 15, color: "var(--a-on-surface-variant)", maxWidth: 280, margin: "0 auto" }}>
            Your 5S audit has been recorded and sent for review.
          </p>
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>
          <button className="a-btn-primary" onClick={() => nav("/")}>Back to Home</button>
          <button className="a-btn-ghost" onClick={() => nav(`/audit/${auditId}/summary`)}>View Summary</button>
        </div>
      </main>
    </div>
  );
}
