import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useLive } from "../hooks/useLive";
import AuditorHome from "./AuditorHome";
import AuditorCapture from "./AuditorCapture";
import AuditorSummary from "./AuditorSummary";
import AuditorSuccess from "./AuditorSuccess";
import AuditorMyAudits from "./AuditorMyAudits";
import AuditorProfile from "./AuditorProfile";
import "../styles/auditor.css";

const TABS = [
  { path: "/", label: "Home", icon: "home" },
  { path: "/my-audits", label: "My Audits", icon: "assignment" },
  { path: "/profile", label: "Profile", icon: "person" },
];

/** Separate mobile-first route tree for the Auditor role. Mounted by main.tsx instead of
 * the admin <Layout>. Uses styles/auditor.css only — never app.css. */
export default function AuditorApp() {
  const nav = useNavigate();
  const loc = useLocation();
  // The admin <Layout> opens the realtime socket; this tree is mounted instead of it, so open it
  // here too, otherwise new allocations / completed audits never reach the auditor's phone.
  useLive();

  return (
    <div className="auditor-app">
      <Routes>
        <Route path="/" element={<AuditorHome />} />
        <Route path="/audit/:auditId" element={<AuditorCapture />} />
        <Route path="/audit/:auditId/summary" element={<AuditorSummary />} />
        <Route path="/audit/:auditId/success" element={<AuditorSuccess />} />
        <Route path="/my-audits" element={<AuditorMyAudits />} />
        <Route path="/profile" element={<AuditorProfile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {TABS.some((t) => t.path === loc.pathname) && (
        <nav className="a-bottom-nav">
          {TABS.map((t) => {
            const active = t.path === loc.pathname;
            return (
              <button key={t.path} className={`a-nav-btn ${active ? "a-nav-btn-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => nav(t.path)}>
                <span className="material-symbols-outlined">{t.icon}</span>
                <span className="a-nav-label">{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
