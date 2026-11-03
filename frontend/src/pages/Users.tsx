import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { User } from "../api/types";
import { IC, Icon } from "../components/Icons";
import { ErrorBox, Field, FilterGroup, Loading, Modal, nextSort, PageHead, Pill, Select, SortTh } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useCycle } from "../lib/cycle";
import { ini, sortBy } from "../lib/format";
import { useToast } from "../lib/toast";

type K = "name" | "emp_id" | "role" | "zone" | "status";
const COLS: [K, string][] = [["name", "Name"], ["emp_id", "Employee ID"], ["role", "Role"], ["zone", "Assigned zone"], ["status", "Status"]];
const rp = (r: string) => (r === "Auditor" ? "p-blue" : r === "5S Incharge" ? "p-amber" : "p-navy");
const PER = 8;

export default function Users() {
  const { can } = useAuth();
  const toast = useToast();
  const admin = can("Super Admin");
  const { data, error, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [s, setS] = useState<{ sort: K; dir: 1 | -1 }>({ sort: "name", dir: 1 });
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const deactivate = useMutation({
    mutationFn: (u: User) => api.del<User>(`/users/${u.id}`),
    onSuccess: (u) => toast(`${u.name} deactivated — audit history is kept`), onError: (e: Error) => toast(e.message),
  });

  const rows = useMemo(() => sortBy((data ?? []).filter((u) =>
    (role === "all" || u.role === role) && (!q || (u.name + u.emp_id + u.zone).toLowerCase().includes(q.toLowerCase()))), s.sort, s.dir), [data, q, role, s]);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const pg = Math.min(page, pages - 1);
  const view = rows.slice(pg * PER, pg * PER + PER);
  const n = (r: string) => data.filter((u) => u.role === r && u.status === "Active").length;

  return (
    <>
      <PageHead title="Users" sub={`${n("Auditor")} auditors · ${n("5S Incharge")} area incharges · ${n("Super Admin")} super admin`}>
        {admin && <button className="btn" onClick={() => setEdit("new")}>+ Add user</button>}
      </PageHead>
      <div className="card">
        <div className="filters" style={{ marginBottom: 16 }}>
          <FilterGroup label="Search"><input type="text" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Name, ID or zone" style={{ width: 230 }} /></FilterGroup>
          <FilterGroup label="Role"><Select value={role} onChange={(v) => { setRole(v); setPage(0); }} options={["all", "Auditor", "5S Incharge", "Super Admin"].map((r) => ({ value: r, label: r === "all" ? "All roles" : r }))} /></FilterGroup>
        </div>
        <div className="tw"><table>
          <thead><tr>{COLS.map(([k, l]) => <SortTh key={k} k={k} label={l} sort={s.sort} dir={s.dir} onSort={(k) => setS(nextSort(s, k))} />)}{admin && <th style={{ textAlign: "right" }}>Actions</th>}</tr></thead>
          <tbody>{view.map((u) => (
            <tr key={u.id}>
              <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="av sm">{ini(u.name)}</div><span className="strong">{u.name}</span></div></td>
              <td className="mono">{u.emp_id}</td>
              <td><Pill cls={rp(u.role)}>{u.role}</Pill></td>
              <td>{u.zone}</td>
              <td><Pill cls={u.status === "Active" ? "p-green" : "p-navy"}>{u.status.toUpperCase()}</Pill></td>
              {admin && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="icoact" title="Edit" onClick={() => setEdit(u)}><Icon d={IC.edit} /></button>
                {u.status === "Active" && <button className="icoact del" title="Deactivate" onClick={() => confirm(`Deactivate ${u.name}? They can no longer sign in; their audit history stays.`) && deactivate.mutate(u)}><Icon d={IC.del} /></button>}
              </td>}
            </tr>))}
          </tbody></table></div>
        <div className="tfoot">
          <span>Showing {rows.length ? pg * PER + 1 : 0}–{Math.min(rows.length, (pg + 1) * PER)} of {rows.length}</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn sm ghost" disabled={pg === 0} onClick={() => setPage(pg - 1)}>Previous</button>
            <button className="btn sm ghost" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next</button>
          </span>
        </div>
      </div>
      {edit && <UserModal user={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={(m) => { toast(m); setEdit(null); }} />}
    </>
  );
}

function UserModal({ user, onClose, onDone }: { user: User | null; onClose: () => void; onDone: (m: string) => void }) {
  const { meta } = useCycle();
  const [f, setF] = useState({ emp_id: user?.emp_id ?? "", name: user?.name ?? "", role: user?.role ?? "Auditor", email: user?.email ?? "", zone_id: user?.zone_id ?? null as number | null, password: "", active: user?.status !== "Inactive" });
  const [err, setErr] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: f.name, role: f.role, email: f.email || null, zone_id: f.zone_id };
      if (f.password) body.password = f.password;
      return user ? api.patch<User>(`/users/${user.id}`, { ...body, active: f.active }) : api.post<User>("/users", { ...body, emp_id: f.emp_id });
    },
    onSuccess: (u) => onDone(user ? `${u.name} updated` : `${u.name} added`), onError: (e: Error) => setErr(e.message),
  });
  return (
    <Modal title={user ? `Edit ${user.name}` : "Add user"} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>{user ? "Save changes" : "Add user"}</button></>}>
      <div className="row2">
        <Field label="Employee ID"><input value={f.emp_id} disabled={!!user} onChange={(e) => setF({ ...f, emp_id: e.target.value })} /></Field>
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      </div>
      <div className="row2">
        <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as User["role"] })}>{["Auditor", "5S Incharge", "Super Admin"].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Assigned zone"><select value={f.zone_id ?? ""} onChange={(e) => setF({ ...f, zone_id: e.target.value ? Number(e.target.value) : null })}><option value="">All zones</option>{meta?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Field>
      </div>
      <Field label="Email (for notifications)"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label={user ? "New password (leave blank to keep)" : "Password (blank uses the default)"}><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      {user && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active — can sign in</label>}
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
