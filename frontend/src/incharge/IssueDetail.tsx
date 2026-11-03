import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { Issue } from "../api/types";
import { isPhotoTooLarge, PHOTO_TOO_LARGE } from "../lib/photo";

export default function IssueDetail() {
  const { issueId } = useParams();
  const id = Number(issueId);
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: issue, isLoading, error } = useQuery({
    // Under the "issues" prefix so useLive's issue.* invalidation and the close mutation refresh it.
    queryKey: ["issues", "one", id],
    // There is no GET /issues/{id}; reuse the list endpoint and find the row, same approach
    // the admin console uses for individual issue lookups.
    queryFn: async () => {
      const r = await api.get<{ items: Issue[] }>("/issues");
      const found = r.items.find((i) => i.id === id);
      if (!found) throw new Error("Issue not found");
      return found;
    },
    enabled: !!id,
  });

  const [note, setNote] = useState("");
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const close = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("note", note);
      if (afterFile) fd.append("after_photo", afterFile);
      return api.post<Issue>(`/issues/${id}/close`, fd);
    },
    onSuccess: (closed) => {
      // Seed the verify screen with the closed row so it never shows the stale "Open" copy.
      qc.setQueryData(["issues", "one", id], closed);
      qc.invalidateQueries({ queryKey: ["issues"] });
      nav(`/issue/${id}/verify`);
    },
    onError: (e) => setErr(
      e instanceof ApiError && e.status === 413 ? PHOTO_TOO_LARGE
        : e instanceof ApiError ? e.message
        : "Could not close this issue. Check your connection and tap Submit again."),
  });

  if (isLoading) return <div className="i-loading">Loading…</div>;
  if (error || !issue) return <div className="i-loading i-error">Could not load this issue. Check your connection, then go back and open it again.</div>;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (isPhotoTooLarge(file)) { setErr(PHOTO_TOO_LARGE); return; }
    setErr("");
    if (afterPreview) URL.revokeObjectURL(afterPreview);
    setAfterFile(file);
    setAfterPreview(URL.createObjectURL(file));
  };

  return (
    <div className="i-page">
      <header className="i-header">
        <button className="i-back-btn" aria-label="Go back" onClick={() => nav("/")}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="i-header-title">{issue.code}</h1>
        <span style={{ width: 40 }} />
      </header>

      <main className="i-main">
        <div className="i-status-strip">
          <div className="i-status-dot" />
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {issue.status.toUpperCase()} • Raised {issue.raised_on} by {issue.raised_by}
          </span>
        </div>

        <section>
          <h2 className="i-section-label" style={{ display: "block", marginBottom: 8 }}>Before</h2>
          {issue.before_photo ? (
            <img className="i-photo-img" src={issue.before_photo} alt="Before" style={{ marginBottom: 12 }} />
          ) : (
            <div className="i-card" style={{ marginBottom: 12, textAlign: "center", color: "var(--i-on-surface-variant)" }}>No before photo attached.</div>
          )}
          <div className="i-card">
            <p style={{ margin: "0 0 8px" }}>{issue.description}</p>
            <p style={{ fontSize: 12, color: "var(--i-on-surface-variant)", display: "flex", alignItems: "center", gap: 4, margin: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>category</span>
              Category: {issue.category_full}
            </p>
          </div>
        </section>

        <section>
          <h2 className="i-section-label" style={{ display: "block", marginBottom: 8 }}>Corrective action</h2>
          <textarea
            className="i-textarea"
            rows={4}
            placeholder="What was done to fix this?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={issue.status === "Closed"}
          />
        </section>

        <section>
          <h2 className="i-section-label" style={{ display: "block", marginBottom: 8 }}>After photo</h2>
          {issue.status === "Closed" ? (
            issue.after_photo ? <img className="i-photo-img" src={issue.after_photo} alt="After" /> : (
              <div className="i-card" style={{ textAlign: "center", color: "var(--i-on-surface-variant)" }}>No after photo attached.</div>
            )
          ) : (
            <label className="i-photo-drop">
              {afterPreview ? (
                <img src={afterPreview} alt="After preview" />
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 36 }}>photo_camera</span>
                  <span style={{ fontWeight: 600 }}>Take after photo</span>
                </>
              )}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickFile} />
            </label>
          )}
        </section>

        {err && <div className="i-error">{err}</div>}
      </main>

      {issue.status === "Open" && (
        <div className="i-footer-fixed">
          <button className="i-btn-primary" disabled={close.isPending} onClick={() => close.mutate()}>
            {close.isPending ? "Submitting…" : "Submit & Close Issue"}
          </button>
        </div>
      )}
    </div>
  );
}
