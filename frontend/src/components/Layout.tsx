import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLive } from "../hooks/useLive";
import { useAuth } from "../lib/auth";
import { useCycle } from "../lib/cycle";
import { ini } from "../lib/format";
import { useToast } from "../lib/toast";
import { IC, Icon } from "./Icons";
import { Select } from "./UI";
import { Tip } from "./Tip";

const PAGES = [
  { path: "/", label: "Dashboard", title: "5S Dashboard", icon: IC.dash },
  { path: "/audits", label: "Audits", title: "Audit Calendar", icon: IC.audit },
  { path: "/issues", label: "Issues", title: "Issue Register", icon: IC.issue, badge: true },
  { path: "/users", label: "Users", title: "Users", icon: IC.user },
  { path: "/zones", label: "Zones", title: "Zones", icon: IC.zone },
  { path: "/allocation", label: "Allocation", title: "Audit Allocation", icon: IC.alloc },
  { path: "/reports", label: "Reports", title: "Reports", icon: IC.rep },
  { path: "/settings", label: "Settings", title: "Settings", icon: IC.set },
];

const LIVE_TEXT = { live: "Live", connecting: "Connecting", offline: "Offline — retrying" };
const LIVE_CLS = { live: "on", connecting: "wait", offline: "off" };

export default function Layout() {
  const { user, logout } = useAuth();
  const { cycle, setCycle, meta } = useCycle();
  const live = useLive();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const page = PAGES.find((p) => (p.path === "/" ? loc.pathname === "/" : loc.pathname.startsWith(p.path))) ?? PAGES[0];

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="wm">VIJAY</div><div className="sm">5S AUDIT</div></div>
        <nav className="nav">
          {PAGES.map((p) => (
            <NavLink key={p.path} to={p.path} end={p.path === "/"}>
              <Icon d={p.icon} />{p.label}
              {p.badge && !!meta?.open_issues && <span className="badge">{meta.open_issues}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="av">{ini(user!.name)}</div>
          <div><div className="who">{user!.name}</div><div className="role">{user!.role}</div></div>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <h1>{page.title}</h1>
          <div className="spacer" />
          <span className={`live ${LIVE_CLS[live]}`} title="Updates from other users appear without refreshing"><i />{LIVE_TEXT[live]}</span>
          {meta && cycle && (
            <Select label="Audit month" value={cycle} onChange={(v) => { setCycle(v); toast(`Showing ${meta.cycles.find((c) => c.key === v)?.label}`); }}
              options={[...meta.cycles].reverse().map((c) => ({ value: c.key, label: c.label }))} />
          )}
          <div className="search">
            <Icon d={IC.search} />
            <input type="text" placeholder="Search issues, zones, people" aria-label="Search issues"
              onKeyDown={(e) => { if (e.key === "Enter") nav(`/issues?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`); }} />
          </div>
          <button className="iconbtn" aria-label="Escalations"
            onClick={() => toast(meta?.escalated ? `${meta.escalated} open issues are past the Plant Head escalation limit` : "No issues are escalated to the Plant Head")}>
            <Icon d={IC.bell} />{!!meta?.escalated && <span className="dot" />}
          </button>
          <div className="av">{ini(user!.name)}</div>
        </header>
        <div className="content">
          {cycle ? <Outlet /> : <div className="loading">Loading live data…</div>}
        </div>
      </div>
      <Tip />
    </div>
  );
}
