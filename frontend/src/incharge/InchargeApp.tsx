import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useLive } from "../hooks/useLive";
import InchargeHome from "./InchargeHome";
import IssueDetail from "./IssueDetail";
import IssueVerification from "./IssueVerification";
import InchargeReports from "./InchargeReports";
import "../styles/incharge.css";

/** Separate mobile-first route tree for the 5S Incharge role. Mounted by main.tsx instead
 * of the admin <Layout>. Uses styles/incharge.css only — never app.css or auditor.css. */
export default function InchargeApp() {
  const { logout, user } = useAuth();
  // The admin <Layout> opens the WebSocket; this tree replaces it, so open it here too or
  // issues closed/raised elsewhere never refresh on the Incharge's phone.
  useLive();
  const nav = useNavigate();
  const loc = useLocation();
  const onHome = loc.pathname === "/";

  return (
    <div className="incharge-app">
      <Routes>
        <Route path="/" element={<InchargeHome />} />
        <Route path="/issue/:issueId" element={<IssueDetail />} />
        <Route path="/issue/:issueId/verify" element={<IssueVerification />} />
        <Route path="/reports" element={<InchargeReports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {onHome && (
        <nav className="i-bottom-nav">
          <button className="i-nav-btn i-nav-btn-active" aria-current="page" onClick={() => nav("/")}>
            <span className="material-symbols-outlined">assignment_late</span>
            <span className="i-nav-label">Issues</span>
          </button>
          <button className="i-nav-btn" onClick={() => nav("/reports")}>
            <span className="material-symbols-outlined">bar_chart</span>
            <span className="i-nav-label">Reports</span>
          </button>
          <button className="i-nav-btn" onClick={logout} title={user?.name}>
            <span className="material-symbols-outlined">account_circle</span>
            <span className="i-nav-label">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
}
