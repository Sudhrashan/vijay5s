import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Audit } from "../api/types";
import { ErrorBox, Field, Loading, Modal, PageHead, Pill } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useCycle } from "../lib/cycle";
import { auditPill, fmtDate, submittedLine } from "../lib/format";
import { useToast } from "../lib/toast";

const EV: Record<string, string> = { Completed: "done", Missed: "miss", "Due today": "due", Scheduled: "plan", Unassigned: "plan" };

export default function Audits() {
  const { cycle, meta } = useCycle();
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, isLoading } = useQuery({ queryKey: ["audits", cycle], queryFn: () => api.get<{ items: Audit[]; today: string }>("/audits", { cycle }) });
  const [open, setOpen] = useState<Audit | null>(null);
  const [adding, setAdding] = useState(false);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const [y, m] = cycle.split("-").map(Number);
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first grid
  const days = new Date(y, m, 0).getDate();
  const today = data.today.startsWith(cycle) ? Number(data.today.slice(8)) : -1;
  const byDay: Record<number, Audit[]> = {};
  data.items.forEach((a) => (byDay[Number(a.planned_date.slice(8))] ||= []).push(a));
  const counts = data.items.reduce<Record<string, number>>((acc, a) => ((acc[a.status] = (acc[a.status] || 0) + 1), acc), {});
  const missed = data.items.filter((a) => a.status === "Missed");
  const label = meta?.cycles.find((c) => c.key === cycle)?.label ?? cycle;
  const staff = can("Super Admin", "5S Incharge");

  return (
    <>
      <PageHead title="Audit Calendar" sub={`${label} · ${data.items.length} audits planned`}>
        <div className="legend">
          <span><i style={{ background: "var(--green)" }} />Completed {counts.Completed || 0}</span>
          <span><i style={{ background: "var(--red)" }} />Missed {counts.Missed || 0}</span>
          <span><i style={{ background: "var(--amber)" }} />Due today {counts["Due today"] || 0}</span>
          <span><i style={{ background: "var(--blue)" }} />Scheduled {(counts.Scheduled || 0) + (counts.Unassigned || 0)}</span>
        </div>
        {staff && <button className="btn" onClick={() => setAdding(true)}>Schedule audit</button>}
      </PageHead>

      <div className="card">
        {data.items.length === 0 && <div className="empty">No audits planned for {label}. Start a new audit cycle from the dashboard.</div>}
        <div className="cal">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => <div className="dh" key={d}>{d}</div>)}
          {Array.from({ length: firstDow }, (_, i) => <div className="day empty" key={"e" + i} />)}
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <div key={d} className={`day ${d === today ? "today" : ""}`}>
              <div className="dn">{d}</div>
              {(byDay[d] || []).map((a) => (
                <button key={a.id} className={`ev ${EV[a.status]}`} style={{ border: 0, textAlign: "left", cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 600 }}
                  onClick={() => setOpen(a)} data-tip={`<b>${a.zone}</b><br>${a.status}${a.score != null ? ` · score ${a.score}%` : ""}`}>{a.zone}</button>))}
            </div>))}
        </div>
      </div>

      <div className="card">
        <h3>Missed audits need a reason</h3>
        <div className="note">{missed.length ? `${missed.length} zone audits were not done on their planned date this cycle` : "No missed audits this cycle"}</div>
        {missed.length > 0 && <div className="tw"><table>
          <thead><tr><th>Zone</th><th>Planned</th><th>Auditor</th><th>Reason</th><th>Action</th></tr></thead>
          <tbody>{missed.map((a) => (
            <tr key={a.id}><td className="strong">{a.zone}</td><td>{fmtDate(a.planned_date)}</td>
              <td>{a.auditors.map((u) => u.name).join(", ") || "—"}</td>
              <td className="rowsub">{a.missed_reason || <Pill cls="p-red">REASON NEEDED</Pill>}</td>
              <td>{staff && <button className="btn sm ghost" onClick={() => setOpen(a)}>Reschedule</button>}</td></tr>))}
          </tbody></table></div>}
      </div>

      {open && <AuditModal audit={open} staff={staff} onClose={() => setOpen(null)} onDone={(msg) => { toast(msg); setOpen(null); }} />}
      {adding && <ScheduleModal onClose={() => setAdding(false)} onDone={(msg) => { toast(msg); setAdding(false); }} />}
    </>
  );
}

function AuditModal({ audit, staff, onClose, onDone }: { audit: Audit; staff: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(audit.planned_date);
  const [score, setScore] = useState(audit.score?.toString() ?? "");
  const [reason, setReason] = useState(audit.missed_reason ?? "");
  const [err, setErr] = useState("");
  const save = useMutation({
    mutationFn: (body: object) => api.patch<Audit>(`/audits/${audit.id}`, body),
    onSuccess: (a) => onDone(`${a.zone} audit saved — ${a.status.toLowerCase()}`),
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <Modal title={`${audit.zone} audit`} onClose={onClose}
      footer={staff && <>
        <button className="btn ghost" onClick={() => save.mutate({ planned_date: date })}>Reschedule</button>
        <button className="btn ghost" onClick={() => save.mutate({ status: "Missed", missed_reason: reason })}>Mark missed</button>
        <button className="btn" onClick={() => save.mutate({ status: "Completed", score: Number(score) })} disabled={!score}>Mark completed</button>
      </>}>
      <dl className="kv">
        <dt>Status</dt><dd><Pill cls={auditPill(audit.status)}>{audit.status.toUpperCase()}</Pill></dd>
        <dt>Auditors</dt><dd>{audit.auditors.map((a) => a.name).join(", ") || "Not assigned yet"}</dd>
        {audit.submitted_by && <><dt>Submitted by</dt><dd>{submittedLine(audit)}</dd></>}
      </dl>
      {staff && <>
        <div className="row2">
          <Field label="Planned date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="5S score (%)"><input type="text" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field>
        </div>
        <Field label="Reason, if missed"><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Line shutdown, auditor on leave…" /></Field>
      </>}
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}

function ScheduleModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const { meta } = useCycle();
  const [zone, setZone] = useState(meta?.zones[0]?.id ?? 0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [auds, setAuds] = useState<number[]>([]);
  const [err, setErr] = useState("");
  const save = useMutation({
    mutationFn: () => api.post<Audit>("/audits", { zone_id: zone, planned_date: date, auditor_ids: auds }),
    onSuccess: (a) => onDone(`${a.zone} audit scheduled for ${fmtDate(a.planned_date)}`),
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <Modal title="Schedule audit" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>Schedule audit</button></>}>
      <div className="row2">
        <Field label="Zone"><select value={zone} onChange={(e) => setZone(Number(e.target.value))}>{meta?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Auditors (hold Ctrl to pick several)">
        <select multiple size={6} value={auds.map(String)} onChange={(e) => setAuds([...e.target.selectedOptions].map((o) => Number(o.value)))}>
          {meta?.auditors.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.zone}</option>)}
        </select>
      </Field>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
