import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Settings } from "../api/types";
import { ErrorBox, Loading, PageHead } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

const NOTIF_LABELS: Record<string, [string, string]> = {
  audit_assigned: ["New audit assigned", "To the auditor, when allocation is saved"],
  issue_raised: ["New issue raised", "To the area incharge, immediately"],
  issue_closed: ["Issue closed", "To the auditor who raised it, for verification"],
  issue_overdue: ["Issue overdue", "To the incharge and area head, daily at 09:00"],
  weekly_summary: ["Weekly zone summary", "To the plant head, Monday 08:00"],
};

const INTEGRITY_LABELS: Record<string, [string, string]> = {
  require_qr: ["Require QR scan to open a zone", "Auditor must scan the zone board"],
  gps_stamp: ["Stamp photos with GPS and time", "Proves the auditor was on the floor"],
  require_after_photo: ["Require an after photo to close", "No closure without visual evidence"],
  allow_gallery: ["Allow photos from gallery", "Off means camera only, no old photos"],
};

const ESC_NAMES = ["Area Head", "Plant Head", "Factory Manager"];
const ESC_EXTRA = ["", " and flag on the dashboard", ", issue marked chronic"];

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button className={`tog ${on ? "on" : ""}`} aria-label={`Toggle ${label}`} onClick={onClick} />;
}

export default function SettingsPage() {
  const { can } = useAuth();
  const admin = can("Super Admin");
  const toast = useToast();
  const qc = useQueryClient();

  const { data, error, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => api.put<Settings>("/settings", patch),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast("Settings saved");
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <Loading />;
  if (error || !data || !form) return <ErrorBox error={error} />;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  const setNum = (key: "closure_target_days" | "min_score" | "audits_per_zone_per_month", v: string) => {
    const n = Number(v);
    setForm((f) => (f ? { ...f, [key]: Number.isFinite(n) ? n : f[key] } : f));
  };

  const toggleNotif = (key: string) =>
    setForm((f) => (f ? { ...f, notifications: { ...f.notifications, [key]: !f.notifications[key] } } : f));

  const toggleIntegrity = (key: string) =>
    setForm((f) => (f ? { ...f, integrity: { ...f.integrity, [key]: !f.integrity[key] } } : f));

  const doSave = () => {
    if (!form) return;
    save.mutate(form);
  };

  return (
    <>
      <PageHead title="Settings" sub="Plant VD01 · applies to every zone and auditor">
        {admin && (
          <button className="btn" onClick={doSave} disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </PageHead>

      <div className="grid c50">
        <div className="card">
          <h3>Escalation matrix</h3>
          <div className="note">An open issue is escalated automatically once it passes each limit</div>
          <div className="esc">
            {form.escalation_days.map((d, i) => (
              <Fragment key={i}>
                <div className="dd">
                  {admin ? (
                    <input
                      type="text"
                      value={d}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setForm((f) => {
                          if (!f) return f;
                          const next = [...f.escalation_days];
                          next[i] = Number.isFinite(n) ? n : next[i];
                          return { ...f, escalation_days: next };
                        });
                      }}
                      style={{ width: 44, textAlign: "center", background: "transparent", border: 0, color: "inherit", font: "inherit" }}
                    />
                  ) : (
                    <>&gt; {d}</>
                  )}{" "}
                  days
                </div>
                <div>
                  Email the <b>{ESC_NAMES[i] ?? `Level ${i + 1}`}</b>
                  {ESC_EXTRA[i] ?? ""}
                </div>
              </Fragment>
            ))}
          </div>
          <div className="demo" style={{ marginTop: 16 }}>
            Changing a limit re-evaluates every open issue right away.
          </div>
        </div>

        <div className="card">
          <h3>Targets</h3>
          <div className="note">The numbers the dashboard measures every zone against</div>
          <div className="setrow">
            <div>
              <div className="t">Closure target</div>
              <div className="d">Days allowed to close an issue</div>
            </div>
            <div className="r">
              <input type="text" value={form.closure_target_days} disabled={!admin}
                onChange={(e) => setNum("closure_target_days", e.target.value)} style={{ width: 64, textAlign: "center" }} />
            </div>
          </div>
          <div className="setrow">
            <div>
              <div className="t">Minimum 5S score</div>
              <div className="d">Below this a zone shows red</div>
            </div>
            <div className="r">
              <input type="text" value={form.min_score} disabled={!admin}
                onChange={(e) => setNum("min_score", e.target.value)} style={{ width: 64, textAlign: "center" }} />
            </div>
          </div>
          <div className="setrow">
            <div>
              <div className="t">Audits per zone per month</div>
              <div className="d">Used to calculate audit compliance</div>
            </div>
            <div className="r">
              <input type="text" value={form.audits_per_zone_per_month} disabled={!admin}
                onChange={(e) => setNum("audits_per_zone_per_month", e.target.value)} style={{ width: 64, textAlign: "center" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid c50">
        <div className="card">
          <h3>Notifications</h3>
          <div className="note">Sent to the app and to the registered email address</div>
          {Object.keys(form.notifications).map((key) => {
            const [t, d] = NOTIF_LABELS[key] ?? [key, ""];
            return (
              <div className="setrow" key={key}>
                <div>
                  <div className="t">{t}</div>
                  <div className="d">{d}</div>
                </div>
                <div className="r">
                  <Toggle on={form.notifications[key]} label={t} onClick={() => admin && toggleNotif(key)} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3>Audit integrity</h3>
          <div className="note">Controls that keep an audit honest</div>
          {Object.keys(form.integrity).map((key) => {
            const [t, d] = INTEGRITY_LABELS[key] ?? [key, ""];
            return (
              <div className="setrow" key={key}>
                <div>
                  <div className="t">{t}</div>
                  <div className="d">{d}</div>
                </div>
                <div className="r">
                  <Toggle on={form.integrity[key]} label={t} onClick={() => admin && toggleIntegrity(key)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
