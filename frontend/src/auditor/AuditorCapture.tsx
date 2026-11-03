import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { useServerCycle } from "../lib/cycle";
import { isPhotoTooLarge, PHOTO_TOO_LARGE } from "../lib/photo";
import type { Audit, AuditsResponse, Finding } from "../api/types";

const CATEGORIES = ["1S", "2S", "3S", "4S", "5S"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  "1S": "1S Sort", "2S": "2S Set in order", "3S": "3S Shine", "4S": "4S Standardize", "5S": "5S Sustain",
};

export default function AuditorCapture() {
  const { auditId } = useParams();
  const id = Number(auditId);
  const nav = useNavigate();
  const qc = useQueryClient();

  const { cycle } = useServerCycle();
  const { data: auditsData } = useQuery({
    queryKey: ["audits", cycle],
    queryFn: () => api.get<AuditsResponse>("/audits", { cycle }),
    enabled: !!cycle,
  });
  const audit: Audit | undefined = auditsData?.items.find((a) => a.id === id);

  const { data: findingsData, isLoading: findingsLoading, error: findingsError } = useQuery({
    queryKey: ["findings", id],
    queryFn: () => api.get<{ items: Finding[] }>(`/audits/${id}/findings`),
    enabled: !!id,
  });
  const findings = findingsData?.items ?? [];

  const [category, setCategory] = useState<string>("1S");
  const [remark, setRemark] = useState("");
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [err, setErr] = useState("");

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (isPhotoTooLarge(file)) { setErr(PHOTO_TOO_LARGE); return; }
    setErr("");
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };

  const addFinding = useMutation({
    mutationFn: async () => {
      if (!photo) throw new Error("Take a photo first.");
      if (remark.trim().length < 3) throw new Error("Add a short remark (at least 3 characters).");
      const fd = new FormData();
      fd.append("category", category);
      fd.append("remark", remark.trim());
      fd.append("photo", photo.file);
      return api.post<Finding>(`/audits/${id}/findings`, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings", id] });
      URL.revokeObjectURL(photo!.preview);
      setPhoto(null);
      setRemark("");
      setErr("");
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not add this finding. Check your connection and try again."),
  });

  const complete = useMutation({
    mutationFn: () => api.post<Audit>(`/audits/${id}/complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      qc.invalidateQueries({ queryKey: ["findings", id] });
      nav(`/audit/${id}/success`);
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Could not submit the audit. Check your connection and tap Submit again."),
  });

  // The audits query refetches live (useLive), so this flips as soon as the other assigned auditor submits.
  const doneByPartner = audit?.status === "Completed" && !complete.isPending && !complete.isSuccess;

  if (findingsLoading) return <div className="a-loading">Loading…</div>;
  if (findingsError) return <div className="a-loading a-error">Could not load this audit. Check your connection, then go back and open it again.</div>;

  return (
    <div className="a-page">
      <header className="a-header">
        <button className="a-back-btn" aria-label="Go back" onClick={() => nav("/")}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="a-header-title" style={{ flex: 1, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {audit?.zone ?? "Audit"}
        </h1>
      </header>

      <main className="a-main" style={{ paddingTop: 72 }}>
        <section>
          <h2 className="a-section-label" style={{ marginBottom: 8, display: "block" }}>Photo</h2>
          <label className="a-photo-drop">
            {photo ? (
              <img src={photo.preview} alt="Finding evidence" />
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ color: "var(--a-primary-container)", fontSize: 36 }}>photo_camera</span>
                <span style={{ fontWeight: 600 }}>Tap to capture photo</span>
              </>
            )}
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPickFile} disabled={addFinding.isPending} />
          </label>
        </section>

        <section className="a-chip-row">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`a-chip ${c === category ? "a-chip-active" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c === category && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>}
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </section>

        <section>
          <h2 className="a-section-label" style={{ marginBottom: 8, display: "block" }}>Remark</h2>
          <textarea
            className="a-field-input"
            style={{ height: 80, paddingLeft: 16, paddingTop: 12, width: "100%", resize: "vertical" }}
            placeholder="What did you find? e.g. Oil leakage near Machine 5"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </section>

        {err && <div className="a-error">{err}</div>}

        <button className="a-btn-outline" disabled={addFinding.isPending || !photo || remark.trim().length < 3} onClick={() => addFinding.mutate()}>
          {addFinding.isPending ? "Adding…" : "Add finding"}
        </button>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 className="a-section-label">Findings logged ({findings.length})</h3>
          {findings.length === 0 && <div className="a-card" style={{ textAlign: "center", color: "var(--a-on-surface-variant)" }}>No findings added yet.</div>}
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

        {doneByPartner && <div className="a-error">{audit?.submitted_by ?? "Your co-auditor"} has already submitted this audit. Go back to Home to see the findings.</div>}
      </main>

      <footer className="a-footer-fixed">
        {findings.length > 0 ? (
          <button className="a-btn-primary a-btn-success" disabled={complete.isPending || doneByPartner} onClick={() => complete.mutate()}>
            {complete.isPending ? "Submitting…" : "Submit Audit"}
          </button>
        ) : (
          <p style={{ fontSize: 13, color: "var(--a-on-surface-variant)", textAlign: "center", margin: 0 }}>
            Add at least one finding to submit
          </p>
        )}
      </footer>
    </div>
  );
}
