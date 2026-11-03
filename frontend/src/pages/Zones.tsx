import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { api } from "../api/client";
import type { User, Zone } from "../api/types";
import { IC, Icon } from "../components/Icons";
import { ErrorBox, Field, Loading, Modal, PageHead } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

export default function ZonesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const admin = can("Super Admin");
  const { data, error, isLoading } = useQuery({ queryKey: ["zones"], queryFn: () => api.get<Zone[]>("/zones") });
  const [edit, setEdit] = useState<Zone | "new" | null>(null);
  const [qr, setQr] = useState(false);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const checkpoints = data.reduce((a, z) => a + z.checkpoints, 0);

  return (
    <>
      <PageHead title="Zones" sub={`${data.length} audit zones · ${checkpoints} checkpoints in total`}>
        {admin && <button className="btn" onClick={() => setEdit("new")}>+ Add zone</button>}
      </PageHead>
      <div className="zgrid">
        {data.map((z) => (
          <div className="zone" key={z.id}>
            <div className="zn">{z.name}</div>
            <div className="zm">{z.checkpoints} checkpoints</div>
            <div className="zm">Incharge: {z.incharge ?? "Unassigned"}</div>
            <div className="zstats">
              <div className="zs">Open<b style={{ color: "var(--red)" }}>{z.open}</b></div>
              <div className="zs">Closed<b style={{ color: "var(--green)" }}>{z.closed}</b></div>
              <div className="zs">Findings<b>{z.findings}</b></div>
              <div className="zs">Avg closure<b>{z.avg_closure != null ? `${z.avg_closure} d` : "—"}</b></div>
            </div>
            {admin && (
              <button className="icoact kebab" title="Edit zone" onClick={() => setEdit(z)}>
                <Icon d={IC.edit} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Zone QR codes</h3>
        <div className="note">
          Each zone board carries a printed QR code. Scanning it opens the right checklist and stamps the audit
          with location and time, so an audit cannot be filed for the wrong area or from the canteen.
        </div>
        <button className="btn ghost" onClick={() => setQr(true)}>Print QR sheet for all zones</button>
      </div>
      {edit && (
        <ZoneModal
          zone={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onDone={(m) => { toast(m); setEdit(null); }}
        />
      )}
      {qr && <QrSheet zones={data} onClose={() => setQr(false)} />}
    </>
  );
}

function ZoneModal({ zone, onClose, onDone }: { zone: Zone | null; onClose: () => void; onDone: (m: string) => void }) {
  // A zone's incharge is a 5S Incharge user, not an auditor. ["users"] is refreshed by user.* events.
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });
  const incharges = (users ?? []).filter((u) => u.role === "5S Incharge" && (u.status === "Active" || u.id === zone?.incharge_id));
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: zone?.name ?? "",
    checkpoints: zone?.checkpoints ?? 10,
    incharge_id: zone?.incharge_id ?? (null as number | null),
  });
  const [err, setErr] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name, checkpoints: f.checkpoints, incharge_id: f.incharge_id };
      return zone ? api.patch<Zone>(`/zones/${zone.id}`, body) : api.post<Zone>("/zones", body);
    },
    onSuccess: (z) => { qc.invalidateQueries({ queryKey: ["zones"] }); onDone(zone ? `${z.name} updated` : `${z.name} added`); },
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <Modal title={zone ? `Edit ${zone.name}` : "Add zone"} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>{zone ? "Save changes" : "Add zone"}</button></>}>
      <Field label="Zone name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Checkpoints"><input type="number" min={1} max={200} value={f.checkpoints} onChange={(e) => setF({ ...f, checkpoints: Number(e.target.value) })} /></Field>
      <Field label="Incharge">
        <select value={f.incharge_id ?? ""} onChange={(e) => setF({ ...f, incharge_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Unassigned</option>
          {incharges.map((u) => <option key={u.id} value={u.id}>{u.name}{u.status === "Inactive" ? " (inactive)" : ""}</option>)}
        </select>
      </Field>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}

function QrSheet({ zones, onClose }: { zones: Zone[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const codes = useQrCodes(zones);
  return (
    <Modal title="Zone QR sheet" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Close</button><button className="btn" onClick={() => window.print()}>Print</button></>}>
      <div ref={ref} className="qr-sheet">
        {zones.map((z) => (
          <div key={z.id} className="qr-card" style={{ textAlign: "center", marginBottom: 20 }}>
            {codes[z.id] ? <img src={codes[z.id]} alt={`QR code for ${z.name}`} width={160} height={160} /> : null}
            <div className="strong">{z.name}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function useQrCodes(zones: Zone[]) {
  const [codes, setCodes] = useState<Record<number, string>>({});
  const key = zones.map((z) => z.qr_token).join(",");
  useMemo(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(zones.map(async (z) => {
        const url = `${location.origin}/zone/${z.qr_token}`;
        const data = await QRCode.toDataURL(url, { width: 160, margin: 1 });
        return [z.id, data] as const;
      }));
      if (!cancelled) setCodes(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return codes;
}
