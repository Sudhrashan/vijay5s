import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useLive } from "../hooks/useLive";
import AuditorHome from "./AuditorHome";
import AuditorCapture from "./AuditorCapture";
import AuditorSummary from "./AuditorSummary";
import AuditorSuccess from "./AuditorSuccess";
import "../styles/auditor.css";

/** Separate mobile-first route tree for the Auditor role. Mounted by main.tsx instead of
 * the admin <Layout>. Uses styles/auditor.css only — never app.css. */
export default function AuditorApp() {
  const { logout, user } = useAuth();
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {loc.pathname === "/" && (
        <nav className="a-bottom-nav">
          <button className="a-nav-btn a-nav-btn-active" aria-current="page" onClick={() => nav("/")}>
            <span className="material-symbols-outlined">home</span>
            <span className="a-nav-label">Home</span>
          </button>
          <button className="a-nav-btn" onClick={() => nav("/")}>
            <span className="material-symbols-outlined">assignment</span>
            <span className="a-nav-label">My Audits</span>
          </button>
          <button className="a-nav-btn" onClick={logout} title={user?.name}>
            <span className="material-symbols-outlined">person</span>
            <span className="a-nav-label">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
}
