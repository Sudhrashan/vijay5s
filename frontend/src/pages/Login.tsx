import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { Field } from "../components/UI";

export default function Login() {
  const { login } = useAuth();
  const [emp, setEmp] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await login(emp, pw); } catch (x) { setErr(x instanceof Error ? x.message : "Sign-in failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <img src="/logo.png" alt="Vijay — Good Health, Happy Family"
          style={{ display: "block", width: "100%", maxWidth: 240, height: "auto", margin: "0 auto 10px", borderRadius: 8 }} />
        <div className="sm" style={{ textAlign: "center" }}>5S AUDIT · PLANT VD01</div>
        <Field label="Employee ID"><input value={emp} onChange={(e) => setEmp(e.target.value)} placeholder="Your employee ID" autoFocus autoComplete="username" /></Field>
        <Field label="Password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
        {err && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}
        <button className="btn" style={{ width: "100%" }} disabled={busy || !emp || !pw}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
