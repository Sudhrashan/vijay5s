import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { useServerCycle } from "../lib/cycle";
import { isPhotoTooLarge, PHOTO_TOO_LARGE } from "../lib/photo";
import type { Audit, AuditsResponse, Checkpoint, CheckpointsResponse } from "../api/types";

const CATEGORIES = ["1S", "2S", "3S", "4S", "5S"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  "1S": "1S Sort", "2S": "2S Set in order", "3S": "3S Shine", "4S": "4S Standardize", "5S": "5S Sustain",
};
const SCORES = [0, 0.5, 1, 1.5, 2] as const;
const SCORE_LABELS: Record<number, string> = {
  0: "Initial situation", 0.5: "First improvements", 1: "Development", 1.5: "Integrated system", 2: "Excellence",
};

export default function AuditorCapture() {
  const { auditId } = useParams();
  const id = Number(auditId);
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: cpData, isLoading: cpLoading, error: cpError } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: () => api.get<CheckpointsResponse>("/checkpoints"),
  });
  const { cycle } = useServerCycle();
  const { data: auditsData } = useQuery({
    queryKey: ["audits", cycle],
    queryFn: () => api.get<AuditsResponse>("/audits", { cycle }),
    enabled: !!cycle,
  });
  const audit: Audit | undefined = auditsData?.items.find((a) => a.id === id);

  const [activeCategory, setActiveCategory] = useState<string>("1S");
  const [scores, setScores] = useState<Record<number, number>>({});
  // Photos are held on the device until submit: the backend only accepts a checkpoint photo
  // once that checkpoint's score row exists (POST .../photo returns 404 before submit).
  const [photos, setPhotos] = useState<Record<number, { file: File; preview: string }>>({});
  const [cpIndex, setCpIndex] = useState(0);
  const [err, setErr] = useState("");

  const items: Checkpoint[] = cpData?.items ?? [];
  const inCategory = useMemo(() => items.filter((c) => c.category === activeCategory), [items, activeCategory]);
  const current = inCategory[cpIndex];

  const answeredCount = Object.keys(scores).length;
  const pct = items.length ? Math.round((answeredCount / items.length) * 100) : 0;

  const submit = useMutation({
    mutationFn: async () => {
      await api.post<Audit>(`/audits/${id}/responses`, {
        responses: items.map((c) => ({ checkpoint_id: c.id, score: scores[c.id] })),
      });
      // Scores are saved; now attach photos. A failed photo does not undo the submitted audit.
      let photoFailures = 0;
      for (const [cpId, { file }] of Object.entries(photos)) {
        const fd = new FormData();
        fd.append("photo", file);
        try { await api.post(`/audits/${id}/responses/${cpId}/photo`, fd); } catch { photoFailures++; }
      }
      return photoFailures;
    },
    onSuccess: (photoFailures) => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      qc.invalidateQueries({ queryKey: ["audit-responses", id] });
      nav(`/audit/${id}/success`, { state: { photoFailures } });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Could not submit the audit. Check your connection and tap Submit again."),
  });

  if (cpLoading) return <div className="a-loading">Loading checklist…</div>;
  if (cpError) return <div className="a-loading a-error">Could not load the checklist. Check your connection, then go back and open the audit again.</div>;
  if (!current) return <div className="a-loading a-error">No checkpoints are set up yet. Ask your administrator to add them.</div>;

  const setScore = (v: number) => {
    if (!current) return;
    setScores((s) => ({ ...s, [current.id]: v }));
  };

  const goNext = () => {
    if (cpIndex < inCategory.length - 1) { setCpIndex(cpIndex + 1); return; }
    const ci = CATEGORIES.indexOf(activeCategory as any);
    const nextCat = CATEGORIES[ci + 1];
    if (nextCat) { setActiveCategory(nextCat); setCpIndex(0); }
  };
  const goPrev = () => {
    if (cpIndex > 0) { setCpIndex(cpIndex - 1); return; }
    const ci = CATEGORIES.indexOf(activeCategory as any);
    const prevCat = CATEGORIES[ci - 1];
    if (prevCat) {
      const prevItems = items.filter((c) => c.category === prevCat);
      setActiveCategory(prevCat);
      setCpIndex(prevItems.length - 1);
    }
  };

  const allAnswered = items.length > 0 && answeredCount === items.length;
  // The audits query refetches live (useLive), so this flips as soon as the other assigned auditor submits.
  const doneByPartner = audit?.status === "Completed" && !submit.isPending && !submit.isSuccess;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    e.target.value = "";
    if (scores[current.id] === undefined) { setErr("Pick a score before attaching a photo."); return; }
    if (isPhotoTooLarge(file)) { setErr(PHOTO_TOO_LARGE); return; }
    setErr("");
    const cpId = current.id;
    setPhotos((p) => {
      if (p[cpId]) URL.revokeObjectURL(p[cpId].preview);
      return { ...p, [cpId]: { file, preview: URL.createObjectURL(file) } };
    });
  };

  return (
    <div className="a-page">
      <header className="a-header">
        <button className="a-back-btn" aria-label="Go back" onClick={() => nav("/")}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="a-header-title" style={{ flex: 1, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {audit?.zone ?? "Audit"}
        </h1>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>
          {activeCategory}
        </div>
      </header>

      <main className="a-main" style={{ paddingTop: 0, gap: 0 }}>
        <div className="a-progress-bar-wrap" style={{ margin: "56px -16px 0" }}>
          <div className="a-progress-top">
            <span style={{ color: "var(--a-on-surface-variant)" }}>{answeredCount} / {items.length} checkpoints</span>
            <span style={{ color: "var(--a-primary-container)", fontWeight: 600 }}>{pct}%</span>
          </div>
          <div className="a-progress-track"><div className="a-progress-fill" style={{ width: `${pct}%` }} /></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "16px 0" }}>
          <section className="a-chip-row">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`a-chip ${c === activeCategory ? "a-chip-active" : ""}`}
                onClick={() => { setActiveCategory(c); setCpIndex(0); }}
              >
                {c === activeCategory && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>}
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </section>

          <section className="a-card">
            <p style={{ fontSize: 13, color: "var(--a-on-surface-variant)", marginBottom: 4 }}>
              Checkpoint {cpIndex + 1} of {inCategory.length} in {activeCategory}
            </p>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{current.text}</p>
          </section>

          <section>
            <h2 className="a-section-label" style={{ marginBottom: 8, display: "block" }}>Score</h2>
            <div className="a-score-group">
              {SCORES.map((v) => (
                <button
                  key={v}
                  className={`a-score-btn ${scores[current.id] === v ? "a-score-btn-active" : ""}`}
                  onClick={() => setScore(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="a-score-legend" style={{ marginTop: 8 }}>
              {SCORES.map((v) => <span key={v}>{v} — {SCORE_LABELS[v]}</span>)}
            </div>
          </section>

          <section>
            <h2 className="a-section-label" style={{ marginBottom: 8, display: "block" }}>Photo (optional)</h2>
            <label className="a-photo-drop">
              {photos[current.id] ? (
                <img src={photos[current.id].preview} alt="Checkpoint evidence" />
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ color: "var(--a-primary-container)", fontSize: 36 }}>photo_camera</span>
                  <span style={{ fontWeight: 600 }}>Tap to capture photo</span>
                </>
              )}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickFile} disabled={submit.isPending} />
            </label>
          </section>

          {doneByPartner && <div className="a-error">{audit?.submitted_by ?? "Your co-auditor"} has already submitted this audit. Go back to Home to see the score.</div>}
          {err && <div className="a-error">{err}</div>}
        </div>
      </main>

      <footer className="a-footer-fixed">
        {allAnswered ? (
          <button className="a-btn-primary a-btn-success" disabled={submit.isPending || doneByPartner} onClick={() => submit.mutate()}>
            {submit.isPending ? "Submitting…" : "Submit Audit"}
          </button>
        ) : (
          <p style={{ fontSize: 13, color: "var(--a-on-surface-variant)", textAlign: "center", margin: 0 }}>
            Answer all {items.length} checkpoints to submit
          </p>
        )}
        <div className="a-footer-row">
          <button className="a-btn-outline" onClick={goPrev} disabled={activeCategory === "1S" && cpIndex === 0}>Previous</button>
          <button className="a-btn-outline" onClick={goNext} disabled={activeCategory === "5S" && cpIndex === inCategory.length - 1}>Next</button>
        </div>
      </footer>
    </div>
  );
}
