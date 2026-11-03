import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, download } from "../api/client";
import type { Issue, Settings } from "../api/types";
import { ErrorBox, Field, FilterGroup, Loading, Modal, nextSort, PageHead, Pill, Select, SortTh } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useCycle } from "../lib/cycle";
import { fmtDate, priPill, sortBy, statusPill } from "../lib/format";
import { useToast } from "../lib/toast";
import { isPhotoTooLarge, PHOTO_TOO_LARGE } from "../lib/photo";

type K = "code" | "description" | "zone" | "category" | "priority" | "raised_by" | "raised_at" | "days" | "status";
const COLS: [K, string][] = [["code", "Issue ID"], ["description", "Finding"], ["zone", "Zone"], ["category", "5S"], ["priority", "Priority"],
  ["raised_by", "Raised by"], ["raised_at", "Raised on"], ["days", "Days open"], ["status", "Status"]];
const PAGE = 40;

export default function Issues() {
  const { meta } = useCycle();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const f = { zone_id: sp.get("zone") ?? "all", category: sp.get("cat") ?? "all", status: sp.get("status") ?? "all", q: sp.get("q") ?? "" };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== "all" ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [s, setS] = useState<{ sort: K; dir: 1 | -1 }>({ sort: "raised_at", dir: -1 });
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Issue | null>(null);
  const [raising, setRaising] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ["issues", f],
    queryFn: () => api.get<{ total: number; items: Issue[] }>("/issues", f),
    placeholderData: (prev) => prev,
  });
  // Overdue limit comes from Settings (same level-2 limit the dashboard and reports use); refreshed by settings.* events.
  const { data: cfg } = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const rows = useMemo(() => (data ? sortBy(data.items, s.sort, s.dir) : []), [data, s]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const od = cfg?.escalation_days[1] ?? 15;

  return (
    <>
      <PageHead title="Issue Register" sub={`${rows.length} of ${data.total} issues match the current filters`}>
        <button className="btn ghost" onClick={() => download("/issues/export.csv", f, "vijay-5s-issues.csv").catch((e) => toast(e.message))}>Export CSV</button>
        <button className="btn" onClick={() => setRaising(true)}>Raise issue</button>
      </PageHead>
      <div className="card">
        <div className="filters" style={{ marginBottom: 16 }}>
          <FilterGroup label="Search"><input type="text" value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Finding, zone, auditor…" style={{ width: 230 }} /></FilterGroup>
          <FilterGroup label="Zone"><Select value={f.zone_id} onChange={(v) => set("zone", v)} options={[{ value: "all", label: "All zones" }, ...(meta?.zones ?? []).map((z) => ({ value: String(z.id), label: z.name }))]} /></FilterGroup>
          <FilterGroup label="5S category"><Select value={f.category} onChange={(v) => set("cat", v)} options={[{ value: "all", label: "All categories" }, ...["1S", "2S", "3S", "4S", "5S"].map((c) => ({ value: c, label: c }))]} /></FilterGroup>
          <FilterGroup label="Status"><Select value={f.status} onChange={(v) => set("status", v)} options={[{ value: "all", label: "All statuses" }, { value: "Open", label: "Open" }, { value: "Closed", label: "Closed" }]} /></FilterGroup>
          <FilterGroup label=" "><button className="btn ghost" onClick={() => setSp({}, { replace: true })}>Clear</button></FilterGroup>
        </div>
        <div className="tw"><table>
          <thead><tr>{COLS.map(([k, l]) => <SortTh key={k} k={k} label={l} sort={s.sort} dir={s.dir} num={k === "days"} onSort={(k) => setS(nextSort(s, k))} />)}</tr></thead>
          <tbody>{rows.slice(0, limit).map((i) => {
            const late = i.status === "Open" && i.days > od;
            return (
              <tr key={i.id} className="clickrow" onClick={() => setOpen(i)}>
                <td className="mono">{i.code}</td>
                <td><div className="strong">{i.description}</div>{i.repeat >= 3 && <div className="rowsub">repeat finding · seen {i.repeat}×</div>}</td>
                <td>{i.zone}</td>
                <td><Pill cls="p-blue">{i.category}</Pill></td>
                <td><Pill cls={priPill(i.priority)}>{i.priority.toUpperCase()}</Pill></td>
                <td className="rowsub">{i.raised_by}</td>
                <td className="rowsub mono">{i.raised_on}</td>
                <td className={`num ${late ? "strong" : ""}`} style={late ? { color: "var(--red)" } : undefined}>{i.days}</td>
                <td><Pill cls={statusPill(i.status)}>{i.status.toUpperCase()}</Pill></td>
              </tr>);
          })}</tbody></table></div>
        {rows.length === 0 && <div className="empty">No issues match these filters. Clear them to see the full register.</div>}
        <div className="tfoot"><span>Showing {Math.min(limit, rows.length)} of {rows.length} issues
          {rows.length > limit && <> · <button className="btn sm ghost" onClick={() => setLimit(limit + PAGE)}>Show more</button></>}</span>
          <span>Days open shown in red once past the {od}-day escalation limit</span></div>
      </div>
      {open && <IssueModal issue={open} onClose={() => setOpen(null)} onDone={(m) => { toast(m); setOpen(null); }} />}
      {raising && <RaiseModal onClose={() => setRaising(false)} onDone={(m) => { toast(m); setRaising(false); }} />}
    </>
  );
}

/** Returns the chosen photo, or null (with an error shown) when it exceeds the upload cap. */
function pickPhoto(e: React.ChangeEvent<HTMLInputElement>, setErr: (m: string) => void): File | null {
  const f = e.target.files?.[0] ?? null;
  if (f && isPhotoTooLarge(f)) { setErr(PHOTO_TOO_LARGE); e.target.value = ""; return null; }
  setErr("");
  return f;
}

function IssueModal({ issue, onClose, onDone }: { issue: Issue; onClose: () => void; onDone: (m: string) => void }) {
  const { can } = useAuth();
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const close = useMutation({
    mutationFn: () => { const fd = new FormData(); fd.append("note", note); if (photo) fd.append("after_photo", photo); return api.post<Issue>(`/issues/${issue.id}/close`, fd); },
    onSuccess: (i) => onDone(`${i.code} closed`), onError: (e: Error) => setErr(e.message),
  });
  const reopen = useMutation({
    mutationFn: () => api.post<Issue>(`/issues/${issue.id}/reopen`),
    onSuccess: (i) => onDone(`${i.code} reopened`), onError: (e: Error) => setErr(e.message),
  });
  const staff = can("Super Admin", "5S Incharge");
  const LV = ["—", "Area Head", "Plant Head", "Factory Manager"];
  return (
    <Modal title={`${issue.code} · ${issue.zone}`} onClose={onClose}
      footer={staff && (issue.status === "Open"
        ? <button className="btn" onClick={() => close.mutate()} disabled={close.isPending}>Close issue</button>
        : <button className="btn ghost" onClick={() => reopen.mutate()} disabled={reopen.isPending}>Reopen issue</button>)}>
      <dl className="kv">
        <dt>Finding</dt><dd>{issue.description}</dd>
        <dt>Category</dt><dd>{issue.category_full}</dd>
        <dt>Priority</dt><dd><Pill cls={priPill(issue.priority)}>{issue.priority.toUpperCase()}</Pill></dd>
        <dt>Raised</dt><dd>{fmtDate(issue.raised_at)} by {issue.raised_by}</dd>
        <dt>Days open</dt><dd>{issue.days}</dd>
        <dt>Escalated to</dt><dd>{LV[issue.escalation_level]}</dd>
        {issue.closed_at && <><dt>Closed</dt><dd>{fmtDate(issue.closed_at)} by {issue.closed_by}</dd></>}
        {issue.closure_note && <><dt>Closure note</dt><dd>{issue.closure_note}</dd></>}
      </dl>
      {(issue.before_photo || issue.after_photo) && <div className="photos">
        {issue.before_photo && <figure><img src={issue.before_photo} alt="Before" /><figcaption>Before</figcaption></figure>}
        {issue.after_photo && <figure><img src={issue.after_photo} alt="After" /><figcaption>After</figcaption></figure>}
      </div>}
      {staff && issue.status === "Open" && <>
        <Field label="After photo"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setPhoto(pickPhoto(e, setErr))} /></Field>
        <Field label="Closure note"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done to fix it" /></Field>
      </>}
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}

function RaiseModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const { meta } = useCycle();
  const [form, setForm] = useState({ zone_id: meta?.zones[0]?.id ?? 0, category: "1S", priority: "Minor", description: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const i = await api.post<Issue>("/issues", form);
      if (photo) { const fd = new FormData(); fd.append("photo", photo); await api.post(`/issues/${i.id}/photo`, fd); }
      return i;
    },
    onSuccess: (i) => onDone(`${i.code} raised in ${i.zone}`), onError: (e: Error) => setErr(e.message),
  });
  return (
    <Modal title="Raise issue" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={() => save.mutate()} disabled={save.isPending || form.description.length < 3}>Raise issue</button></>}>
      <div className="row2">
        <Field label="Zone"><select value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: Number(e.target.value) })}>{meta?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Field>
        <Field label="5S category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{meta?.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
      </div>
      <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{["Minor", "Major", "Critical"].map((p) => <option key={p}>{p}</option>)}</select></Field>
      <Field label="Finding"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Oil leakage near Machine 5" /></Field>
      <Field label="Before photo (optional)"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setPhoto(pickPhoto(e, setErr))} /></Field>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
