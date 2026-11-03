import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Audit, AuditsResponse } from "../api/types";
import { ErrorBox, Loading, PageHead, Pill } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useCycle } from "../lib/cycle";
import { auditPill, fmtDate, ini } from "../lib/format";
import { useToast } from "../lib/toast";

export default function AllocationPage() {
  const { cycle, meta } = useCycle();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const staff = can("Super Admin", "5S Incharge");

  const { data, error, isLoading } = useQuery({
    queryKey: ["audits", cycle],
    queryFn: () => api.get<AuditsResponse>("/audits", { cycle }),
  });

  // Local working copy of auditor_ids per audit_id, seeded from the server and reset whenever the cycle changes.
  const [rows, setRows] = useState<Record<number, number[]>>({});
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!data) return;
    const seed: Record<number, number[]> = {};
    data.items.forEach((a) => (seed[a.id] = a.auditors.map((u) => u.id)));
    setRows(seed);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<{ assigned: number; changed: number }>("/allocation", {
        rows: Object.entries(rows).map(([audit_id, auditor_ids]) => ({ audit_id: Number(audit_id), auditor_ids })),
      }),
    onSuccess: (r) => {
      toast(`Allocation saved — ${r.assigned} zones assigned`);
      qc.invalidateQueries({ queryKey: ["audits"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const load = useMemo(() => {
    const l: Record<number, number> = {};
    Object.values(rows).forEach((ids) => ids.forEach((id) => (l[id] = (l[id] || 0) + 1)));
    return l;
  }, [rows]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const label = meta?.cycles.find((c) => c.key === cycle)?.label ?? cycle;
  const assignedCount = data.items.filter((a) => (rows[a.id] ?? []).length > 0).length;
  const auditors = meta?.auditors ?? [];

  const removeAuditor = (auditId: number, userId: number) =>
    setRows((r) => ({ ...r, [auditId]: (r[auditId] ?? []).filter((id) => id !== userId) }));

  const addAuditor = (auditId: number, userId: number) => {
    setRows((r) => (r[auditId]?.includes(userId) ? r : { ...r, [auditId]: [...(r[auditId] ?? []), userId] }));
    setOpenMenu(null);
  };

  return (
    <>
      <PageHead title="Audit Allocation" sub={`${label} · ${assignedCount} of ${data.items.length} zones assigned`}>
        {staff && (
          <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
            Save allocation
          </button>
        )}
      </PageHead>

      {err && <div className="err">{err}</div>}

      <div className="grid c-alloc">
        <div className="card">
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th style={{ minWidth: 260 }}>Assigned auditors</th>
                  <th>Audit date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a: Audit) => {
                  const assigned = rows[a.id] ?? [];
                  const available = auditors.filter((u) => !assigned.includes(u.id));
                  return (
                    <tr key={a.id}>
                      <td className="strong">{a.zone}</td>
                      <td style={{ position: "relative" }}>
                        {assigned.map((uid) => {
                          const u = auditors.find((x) => x.id === uid);
                          const name = u?.name ?? `#${uid}`;
                          return (
                            <span className="chip" key={uid}>
                              <span className="av sm">{ini(name)}</span>
                              {name.split(" ")[0]}
                              {staff && (
                                <button aria-label={`Remove ${name}`} onClick={() => removeAuditor(a.id, uid)}>
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {staff && (
                          <span className="chip add" onClick={() => setOpenMenu(openMenu === a.id ? null : a.id)}>
                            + Add
                          </span>
                        )}
                        {staff && openMenu === a.id && (
                          <div className="menu" style={{ position: "absolute", zIndex: 10, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
                            {available.length === 0 && <div className="note" style={{ padding: 8 }}>No more auditors available</div>}
                            {available.map((u) => (
                              <div
                                key={u.id}
                                className="menu-item"
                                style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, fontSize: 13 }}
                                onClick={() => addAuditor(a.id, u.id)}
                              >
                                {u.name} <span className="rowsub">· {u.zone}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="rowsub mono">{fmtDate(a.planned_date)}</td>
                      <td>
                        <Pill cls={auditPill(assigned.length ? (a.status === "Unassigned" ? "Scheduled" : a.status) : "Unassigned")}>
                          {(assigned.length ? (a.status === "Unassigned" ? "Scheduled" : a.status) : "Unassigned").toUpperCase()}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Available auditors</h3>
          <div className="note">Zones already assigned this cycle</div>
          {auditors.map((u) => (
            <div className="aud" key={u.id}>
              <div className="av sm">{ini(u.name)}</div>
              <div>
                <div className="nm">{u.name}</div>
                <div className="mt">{u.zone ?? "All zones"}</div>
              </div>
              <span className="load">{load[u.id] || 0} {(load[u.id] || 0) === 1 ? "zone" : "zones"}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
