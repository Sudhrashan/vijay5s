import { useEffect } from "react";

/** Full-screen photo view. Tap anywhere or press Esc to close. */
export default function PhotoViewer({ src, caption, onClose }: { src: string; caption?: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-label="Photo" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <button aria-label="Close photo" onClick={onClose}
        style={{ position: "absolute", top: 12, right: 12, width: 44, height: 44, borderRadius: 22, border: 0, background: "rgba(255,255,255,0.15)", color: "#fff" }}>
        <span className="material-symbols-outlined">close</span>
      </button>
      <img src={src} alt={caption || "Photo"} style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 8 }} />
      {caption && <p style={{ color: "#fff", marginTop: 12, textAlign: "center", fontSize: 15 }}>{caption}</p>}
    </div>
  );
}
