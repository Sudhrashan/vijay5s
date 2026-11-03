import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Issue } from "../api/types";

/**
 * "Issue Verification" (Interface3): a read-only confirmation screen shown for a CLOSED issue —
 * a success strip ("Closed on <date> by <who> • N days open"), a before/after photo comparison,
 * and the original issue text plus the corrective-action note. It is not a review-before-close
 * step (there is no approve/reject action and no inputs); it is what the Incharge sees after
 * closing an issue, and what re-opening the same issue later shows again as a receipt.
 * InchargeHome and IssueDetail route here for any issue whose status is already "Closed".
 */
export default function IssueVerification() {
  const { issueId } = useParams();
  const id = Number(issueId);
  const nav = useNavigate();

  const { data: issue, isLoading, error } = useQuery({
    queryKey: ["issues", "one", id],
    queryFn: async () => {
      const r = await api.get<{ items: Issue[] }>("/issues");
      const found = r.items.find((i) => i.id === id);
      if (!found) throw new Error("Issue not found");
      return found;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="i-loading">Loading…</div>;
  if (error || !issue) return <div className="i-loading i-error">Could not load this issue. Check your connection, then go back and open it again.</div>;

  const closedOn = issue.closed_at ? new Date(issue.closed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

  return (
    <div className="i-page">
      <header className="i-header">
        <button className="i-back-btn" aria-label="Go back" onClick={() => nav("/")}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="i-header-title">{issue.code} — {issue.status}</h1>
        <span style={{ width: 40 }} />
      </header>

      <main className="i-main">
        {issue.status === "Closed" ? (
          <div className="i-status-strip i-status-strip-closed">
            <span className="material-symbols-outlined">check_circle</span>
            <span>Closed on {closedOn} by {issue.closed_by ?? "—"} • {issue.days} days open</span>
          </div>
        ) : (
          <div className="i-status-strip">
            <div className="i-status-dot" />
            <span>Still open • raised {issue.raised_on} by {issue.raised_by}</span>
          </div>
        )}

        <section className="i-compare">
          <div className="i-compare-half">
            <span className="i-compare-tag i-compare-tag-before">Before</span>
            {issue.before_photo ? <img src={issue.before_photo} alt="Before" /> : (
              <div className="i-compare-empty"><span className="material-symbols-outlined">image_not_supported</span></div>
            )}
          </div>
          <div className="i-compare-half">
            <span className="i-compare-tag i-compare-tag-after">After</span>
            {issue.after_photo ? <img src={issue.after_photo} alt="After" /> : (
              <div className="i-compare-empty"><span className="material-symbols-outlined">image_not_supported</span></div>
            )}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="i-card">
            <h3 className="i-section-label" style={{ display: "block", marginBottom: 4 }}>Issue</h3>
            <p style={{ margin: 0, color: "var(--i-on-surface-variant)" }}>{issue.description}</p>
          </div>
          <div className="i-card">
            <h3 className="i-section-label" style={{ display: "block", marginBottom: 4 }}>Corrective action</h3>
            <p style={{ margin: 0, color: "var(--i-on-surface-variant)" }}>{issue.closure_note || "No note recorded."}</p>
          </div>
        </section>

        <button className="i-btn-outline" onClick={() => nav("/")}>Back to issues</button>
      </main>
    </div>
  );
}
