import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, download } from "../api/client";
import { BarRow, LineChart } from "../components/Charts";
import { ErrorBox, FilterGroup, Loading, PageHead, Pill, Select } from "../components/UI";
import { useCycle } from "../lib/cycle";
import { useToast } from "../lib/toast";
import type { Report } from "../api/types";

const CATS = ["1S", "2S", "3S", "4S", "5S"];
const CAT_LABELS = ["1S Sort", "2S Set in Order", "3S Shine", "4S Standardize", "5S Sustain"];

export default function Reports() {
  const { meta } = useCycle();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const cycles = meta?.cycles ?? [];
  const defFrom = cycles.length > 5 ? cycles[cycles.length - 6].key : cycles[0]?.key;
  const defTo = meta?.current_cycle;

  const f = {
    frm: sp.get("frm") ?? defFrom ?? "",
    to: sp.get("to") ?? defTo ?? "",
    zone_id: sp.get("zone") ?? "all",
    auditor_id: sp.get("aud") ?? "all",
    category: sp.get("cat") ?? "all",
    status: sp.get("status") ?? "all",
  };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== "all" ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  const params = {
    frm: f.frm || undefined,
    to: f.to || undefined,
    zone_id: f.zone_id === "all" ? undefined : f.zone_id,
    auditor_id: f.auditor_id === "all" ? undefined : f.auditor_id,
    category: f.category === "all" ? undefined : f.category,
    status: f.status === "all" ? undefined : f.status,
  };

  const { data, error, isLoading } = useQuery({
    queryKey: ["reports", params],
    queryFn: () => api.get<Report>("/reports", params),
    enabled: !!f.frm && !!f.to,
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => data?.issues.slice(0, 25) ?? [], [data]);

  if (!meta || isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const od = data.overdue_days;
  const range = data.months;
  const catTotals = CATS.map((_, i) => range.reduce((s, m) => s + (m.fcat[i] ?? 0), 0));
  const catMax = Math.max(1, ...catTotals);

  return (
    <>
      <PageHead title="Reports" sub={`${data.from} – ${data.to} · ${data.total} issues in scope`}>
        <button className="btn ghost" onClick={() => download("/reports/export.xlsx", params, "vijay-5s-report.xlsx").catch((e) => toast(e.message))}>Export Excel</button>
      </PageHead>

      <div className="card">
        <div className="filters">
          <FilterGroup label="From"><Select value={f.frm} onChange={(v) => set("frm", v)} options={cycles.map((c) => ({ value: c.key, label: c.label }))} /></FilterGroup>
          <FilterGroup label="To"><Select value={f.to} onChange={(v) => set("to", v)} options={cycles.map((c) => ({ value: c.key, label: c.label }))} /></FilterGroup>
          <FilterGroup label="Zone"><Select value={f.zone_id} onChange={(v) => set("zone", v)} options={[{ value: "all", label: "All zones" }, ...meta.zones.map((z) => ({ value: String(z.id), label: z.name }))]} /></FilterGroup>
          <FilterGroup label="Auditor"><Select value={f.auditor_id} onChange={(v) => set("aud", v)} options={[{ value: "all", label: "All auditors" }, ...meta.auditors.map((a) => ({ value: String(a.id), label: a.name }))]} /></FilterGroup>
          <FilterGroup label="5S category"><Select value={f.category} onChange={(v) => set("cat", v)} options={[{ value: "all", label: "All categories" }, ...meta.categories.map((c) => ({ value: c.key, label: c.label }))]} /></FilterGroup>
          <FilterGroup label="Status"><Select value={f.status} onChange={(v) => set("status", v)} options={[{ value: "all", label: "All statuses" }, { value: "Open", label: "Open" }, { value: "Closed", label: "Closed" }]} /></FilterGroup>
        </div>
      </div>

      <div className="grid c60-40">
        <div className="card">
          <div className="cardhead">
            <div><h3>Monthly trend</h3><div className="note">Issues raised against issues closed</div></div>
            <div className="legend"><span><i style={{ background: "var(--blue)" }} />Raised</span><span><i style={{ background: "var(--green)" }} />Closed</span></div>
          </div>
          <LineChart rows={range.map((m) => ({ l: m.label.slice(0, 3), a: m.raised, b: m.closed }))} />
        </div>
        <div className="card">
          <h3>Closure performance</h3>
          <div className="note">Against the {data.closure_target}-day plant target</div>
          <div style={{ display: "flex", gap: 26, margin: "8px 0 18px" }}>
            <div><div className="lab">Avg closure</div><div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.03em" }}>{data.avg_closure ?? "—"} d</div></div>
            <div><div className="lab">Closed</div><div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.03em" }}>{data.closed}</div></div>
            <div><div className="lab">Still open</div><div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.03em", color: "var(--red)" }}>{data.open}</div></div>
          </div>
          {range.map((m) => (
            <BarRow key={m.key} name={m.label.split(" ")[0]} value={m.avg} max={16}
              color={m.avg <= data.closure_target ? "var(--green)" : m.avg <= od ? "var(--amber)" : "var(--red)"}
              tip={`<b>${m.label}</b><br>Avg ${m.avg} days to close`} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Category breakdown</h3>
        <div className="note">Findings logged by auditors, by 5S category, over the selected range</div>
        {CATS.map((c, i) => <BarRow key={c} name={CAT_LABELS[i]} value={catTotals[i]} max={catMax}
          tip={`<b>${CAT_LABELS[i]}</b><br>${catTotals[i]} findings`} />)}
      </div>

      <div className="card">
        <h3>Issue detail</h3>
        <div className="note">Days open turns red past the {od}-day escalation limit</div>
        <div className="tw"><table>
          <thead><tr><th>Issue ID</th><th>Zone</th><th>5S</th><th>Raised by</th><th>Raised on</th><th className="num">Days open</th><th>Status</th></tr></thead>
          <tbody>{rows.map((i) => (
            <tr key={i.id}>
              <td className="mono">{i.code}</td>
              <td className="strong">{i.zone}</td>
              <td><Pill cls="p-blue">{i.category}</Pill></td>
              <td className="rowsub">{i.raised_by}</td>
              <td className="rowsub mono">{i.raised_on}</td>
              <td className="num" style={i.days > od ? { color: "var(--red)", fontWeight: 600 } : undefined}>{i.days}</td>
              <td><Pill cls={i.status === "Open" ? "p-red" : "p-green"}>{i.status.toUpperCase()}</Pill></td>
            </tr>
          ))}</tbody>
        </table></div>
        {rows.length === 0 && <div className="empty">No issues match these filters.</div>}
        <div className="tfoot"><span>Showing {rows.length} of {data.total} issues</span></div>
      </div>
    </>
  );
}
