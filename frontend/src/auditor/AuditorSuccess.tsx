import { useLocation, useNavigate, useParams } from "react-router-dom";

export default function AuditorSuccess() {
  const { auditId } = useParams();
  const nav = useNavigate();
  const photoFailures: number = (useLocation().state as { photoFailures?: number } | null)?.photoFailures ?? 0;

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
          {photoFailures > 0 && (
            <p className="a-error" style={{ fontSize: 13, maxWidth: 280, margin: "8px auto 0" }}>
              {photoFailures} photo{photoFailures === 1 ? "" : "s"} did not upload. Your scores are saved; check your connection and tell your 5S Incharge.
            </p>
          )}
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>
          <button className="a-btn-primary" onClick={() => nav("/")}>Back to Home</button>
          <button className="a-btn-ghost" onClick={() => nav(`/audit/${auditId}/summary`)}>View Summary</button>
        </div>
      </main>
    </div>
  );
}
