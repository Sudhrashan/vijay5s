import { useAuth } from "../lib/auth";

export default function AuditorProfile() {
  const { user, logout } = useAuth();
  const rows: [string, string | undefined][] = [
    ["Name", user?.name],
    ["Employee ID", user?.emp_id],
    ["Role", user?.role],
    ["Home zone", user?.zone || "—"],
  ];

  return (
    <div className="a-page">
      <header className="a-header">
        <div className="a-header-left"><h1 className="a-header-title">Profile</h1></div>
      </header>
      <main className="a-main">
        <section className="a-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--a-on-surface-variant)", fontSize: 14 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 14, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </section>
        <button className="a-btn-ghost" onClick={() => { if (window.confirm("Sign out of the 5S Audit app?")) logout(); }}>
          Sign out
        </button>
      </main>
    </div>
  );
}
