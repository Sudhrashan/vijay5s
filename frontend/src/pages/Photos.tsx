import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { GalleryFinding } from "../api/types";
import { ErrorBox, Loading, PageHead, Pill, Select } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useCycle } from "../lib/cycle";
import { useToast } from "../lib/toast";
import { fmtDateTime } from "../lib/format";

const CATS = ["1S", "2S", "3S", "4S", "5S"];

export default function Photos() {
  const { cycle, meta } = useCycle();
  const [zoneId, setZoneId] = useState(0);
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const { can } = useAuth();
  const isAdmin = can("Super Admin");
  const toast = useToast();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (f: GalleryFinding) => api.del<{ ok: boolean }>(`/findings/${f.id}`),
    onSuccess: (_r, f) => {
      toast(`${f.issue_code ?? "Photo"} deleted`);
      setOpen(null);
      qc.invalidateQueries({ queryKey: ["findings"] });
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast(e.message),
  });
  const askDelete = (f: GalleryFinding) => {
    if (window.confirm(`Delete this finding${f.issue_code ? ` and issue ${f.issue_code}` : ""}?\n\n"${f.remark}"\n\nIts before and after photos are removed too. This cannot be undone.`)) del.mutate(f);
  };

  const { data, error, isLoading } = useQuery({
    queryKey: ["findings", "gallery", cycle, zoneId, cat],
    queryFn: () => api.get<{ items: GalleryFinding[] }>("/findings", { cycle, zone_id: zoneId || undefined, category: cat || undefined }),
  });
  const items = (data?.items ?? []).filter((f) => !status || f.issue_status === status);

  // Zones with the most findings first, so the worst areas are at the top.
  const groups = useMemo(() => {
    const by = new Map<string, GalleryFinding[]>();
    items.forEach((f) => by.set(f.zone, [...(by.get(f.zone) ?? []), f]));
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);
  const flat = groups.flatMap(([, fs]) => fs);
  const label = meta?.cycles.find((c) => c.key === cycle)?.label ?? cycle;

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <PageHead title="Audit photos" sub={`${label} · ${items.length} photo${items.length === 1 ? "" : "s"} across ${groups.length} zone${groups.length === 1 ? "" : "s"}`}>
        <Select label="Zone" value={zoneId} onChange={setZoneId}
          options={[{ value: 0, label: "All zones" }, ...(meta?.zones ?? []).map((z) => ({ value: z.id, label: z.name }))]} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["", ...CATS].map((c) => (
            <button key={c || "all"} className={`btn sm ${cat === c ? "" : "ghost"}`} onClick={() => setCat(c)}>{c || "All"}</button>
          ))}
        </div>
        <Select label="Status" value={status} onChange={setStatus}
          options={[{ value: "", label: "Open and closed" }, { value: "Open", label: "Open only" }, { value: "Closed", label: "Closed only" }]} />
      </PageHead>

      {items.length === 0 && <div className="card"><div className="empty">No audit photos for {label} with these filters yet.</div></div>}

      {groups.map(([zone, fs]) => (
        <div className="card" key={zone}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {zone} <Pill cls="p-red">{fs.length} finding{fs.length === 1 ? "" : "s"}</Pill>
            <span className="note" style={{ margin: 0 }}>
              {CATS.map((c) => [c, fs.filter((f) => f.category === c).length] as const).filter(([, n]) => n).map(([c, n]) => `${c}: ${n}`).join(" · ")}
            </span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginTop: 12 }}>
            {fs.map((f) => (
              <div key={f.id} style={{ border: "1px solid var(--line, #e3e8ef)", borderRadius: 12, background: "var(--card, #fff)", overflow: "hidden" }}>
                <button onClick={() => setOpen(flat.indexOf(f))} aria-label="Open photo"
                  style={{ display: "grid", gridTemplateColumns: f.after_photo ? "1fr 1fr" : "1fr", gap: 2, width: "100%", border: 0, padding: 0, background: "none", cursor: "zoom-in" }}>
                  <PhotoTile src={f.photo_url} label={f.after_photo ? "Before" : undefined} alt={f.remark} />
                  {f.after_photo && <PhotoTile src={f.after_photo} label="After" alt={`After: ${f.remark}`} />}
                </button>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Pill cls="p-blue">{f.category}</Pill>
                    {f.issue_status && <Pill cls={f.issue_status === "Closed" ? "p-green" : "p-red"}>{f.issue_status.toUpperCase()}</Pill>}
                    {f.issue_code && <span className="rowsub mono">{f.issue_code}</span>}
                  </div>
                  <p style={{ margin: "6px 0 4px", fontSize: 14, fontWeight: 600 }}>{f.remark}</p>
                  <div className="rowsub">{[f.auditors, f.recorded_at && fmtDateTime(f.recorded_at)].filter(Boolean).join(" · ")}</div>
                  {isAdmin && (
                    <button className="btn sm ghost" style={{ marginTop: 8, color: "var(--red)" }} disabled={del.isPending} onClick={() => askDelete(f)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {open !== null && flat[open] && <Lightbox items={flat} index={open} onIndex={setOpen} onClose={() => setOpen(null)}
        onDelete={isAdmin ? askDelete : undefined} />}
    </>
  );
}

function PhotoTile({ src, label, alt }: { src: string; label?: string; alt: string }) {
  return (
    <div style={{ position: "relative" }}>
      <img src={src} alt={alt} loading="lazy" style={{ width: "100%", height: 240, objectFit: "cover", display: "block" }} />
      {label && <span style={{ position: "absolute", left: 8, top: 8, background: label === "After" ? "var(--green)" : "rgba(0,0,0,0.65)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{label}</span>}
    </div>
  );
}

function Lightbox({ items, index, onIndex, onClose, onDelete }: { items: GalleryFinding[]; index: number; onIndex: (i: number) => void; onClose: () => void; onDelete?: (f: GalleryFinding) => void }) {
  const f = items[index];
  const prev = () => onIndex((index - 1 + items.length) % items.length);
  const next = () => onIndex((index + 1) % items.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const nav = { position: "absolute", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", color: "#fff", border: 0, borderRadius: 999, width: 48, height: 48, fontSize: 28, cursor: "pointer" } as const;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <button aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: 0, color: "#fff", fontSize: 32, cursor: "pointer" }}>×</button>
      {items.length > 1 && <button aria-label="Previous photo" style={{ ...nav, left: 16 }} onClick={(e) => { e.stopPropagation(); prev(); }}>‹</button>}
      {items.length > 1 && <button aria-label="Next photo" style={{ ...nav, right: 16 }} onClick={(e) => { e.stopPropagation(); next(); }}>›</button>}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 12, maxWidth: "100%", justifyContent: "center", flexWrap: "wrap" }}>
        {([["Before", f.photo_url], ["After", f.after_photo]] as const).filter(([, u]) => u).map(([lab, u]) => (
          <figure key={lab} style={{ margin: 0, textAlign: "center", flex: f.after_photo ? "1 1 320px" : "0 1 auto", maxWidth: f.after_photo ? "48vw" : "100%" }}>
            <img src={u!} alt={`${lab}: ${f.remark}`} style={{ maxWidth: "100%", maxHeight: f.after_photo ? "70vh" : "78vh", objectFit: "contain", borderRadius: 8 }} />
            {f.after_photo && <figcaption style={{ color: "#fff", fontWeight: 700, marginTop: 6 }}>{lab}</figcaption>}
          </figure>
        ))}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ color: "#fff", marginTop: 12, textAlign: "center", maxWidth: 720 }}>
        <div style={{ fontSize: 13, opacity: 0.8 }}>{[f.zone, f.category, f.issue_code, f.issue_status, `${index + 1} of ${items.length}`].filter(Boolean).join(" · ")}</div>
        <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{f.remark}</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{[f.auditors, f.recorded_at && fmtDateTime(f.recorded_at)].filter(Boolean).join(" · ")}</div>
        {onDelete && <button onClick={() => onDelete(f)} style={{ marginTop: 10, background: "var(--red)", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>Delete this finding</button>}
      </div>
    </div>
  );
}
