import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, download } from "../api/client";
import type { Dashboard as D } from "../api/types";
import { BarRow, GroupedChart } from "../components/Charts";
import { IC } from "../components/Icons";
import { ErrorBox, Kpi, Loading, PageHead, Pill } from "../components/UI";
import { useAuth } from "../lib/auth";
import { useCycle } from "../lib/cycle";
import { ini, monthName, scoreColor, scorePill, shortMonth, statusPill } from "../lib/format";
import { useToast } from "../lib/toast";

const AGE_COLORS = ["var(--green)", "var(--amber)", "#E86C1A", "var(--red)"];

function nextCycle(c: string) {
  const [y, m] = c.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export default function Dashboard() {
  const { cycle } = useCycle();
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data: d, error, isLoading } = useQuery({ queryKey: ["dashboard", cycle], queryFn: () => api.get<D>("/dashboard", { cycle }) });
  const newCycle = useMutation({
    mutationFn: () => api.post<{ cycle: string; created: number }>("/audits/cycle", { cycle: nextCycle(cycle) }),
    onSuccess: (r) => toast(`${r.cycle} audit cycle created with ${r.created} audits — allocate auditors next`),
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <Loading />;
  if (error || !d) return <ErrorBox error={error} />;

  const m = d.current, months = d.months, prev = months[months.length - 2];
  const hist = (k: keyof typeof m) => months.map((x) => x[k] as number);
  const delta = (a: number, b?: number) => {
    if (!b) return <span>no earlier data</span>;
    const p = ((a - b) / b) * 100, up = p >= 0;
    return <><span className={up ? "up" : "down"}>{up ? "▲" : "▼"} {Math.abs(p).toFixed(0)}%</span> vs {monthName(prev.label)}</>;
  };
  const zrows = [...d.zones].sort((a, b) => b.open - a.open).filter((z) => z.open > 0);
  const catMax = Math.max(1, ...m.cat);
  const ageTot = d.ageing.reduce((a, b) => a + b.value, 0);
  const CATS = ["1S Sort", "2S Set in Order", "3S Shine", "4S Standardize", "5S Sustain"];
  const topCat = CATS[m.cat.indexOf(Math.max(...m.cat))];

  return (
    <>
      <PageHead title="5S Dashboard" sub={`Plant VD01 · ${d.label} · ${d.zone_count} zones · ${d.auditor_count} auditors`}>
        <button className="btn ghost" onClick={() => download("/reports/export.xlsx", { frm: months[0].key, to: cycle }, `vijay-5s-summary-${cycle}.xlsx`).catch((e) => toast(e.message))}>Export summary</button>
        {can("Super Admin", "5S Incharge") && <button className="btn" disabled={newCycle.isPending} onClick={() => newCycle.mutate()}>Start new audit cycle</button>}
      </PageHead>

      <div className="grid kpis">
        <Kpi label="Audit compliance" value={`${m.comp}%`} tint="var(--t-blue)" color="var(--blue)" icon={IC.audit} trend={`${m.audits_done} of ${m.audits_total} audits done`} spark={hist("comp")} />
        <Kpi label="Open issues" value={m.open} tint="var(--t-red)" color="var(--red)" icon={IC.issue} trend={delta(m.open, prev?.open)} spark={hist("open")} />
        <Kpi label="Closed issues" value={m.closed} tint="var(--t-green)" color="var(--green)" icon={IC.check} trend={delta(m.closed, prev?.closed)} spark={hist("closed")} />
        <Kpi label="Overdue" value={m.overdue} tint="var(--t-amber)" color="var(--amber)" icon={IC.alert} trend={`past ${d.overdue_days}-day limit`} spark={hist("overdue")} />
        <Kpi label="Avg closure" value={`${m.avg} d`} tint="var(--t-grey)" color="var(--muted)" icon={IC.clock}
          trend={<>target {d.closure_target} d · <span className={m.avg <= d.closure_target ? "up" : "down"}>{m.avg <= d.closure_target ? "on target" : `${(m.avg - d.closure_target).toFixed(1)} d over`}</span></>} spark={hist("avg")} />
      </div>

      <div className="grid c60-40">
        <div className="card">
          <div className="cardhead">
            <div><h3>Open vs closed issues</h3><div className="note">Rolling six months, plant-wide</div></div>
            <div className="legend"><span><i style={{ background: "var(--red)" }} />Open</span><span><i style={{ background: "var(--green)" }} />Closed</span></div>
          </div>
          <GroupedChart rows={months.map((x) => ({ l: shortMonth(x.label), open: x.open, closed: x.closed }))} />
        </div>
        <div className="card">
          <h3>5S category analysis</h3>
          <div className="note">{m.raised} issues raised in {monthName(m.label)}</div>
          {CATS.map((c, i) => <BarRow key={c} name={c} value={m.cat[i]} max={catMax}
            tip={`<b>${c}</b><br>${m.cat[i]} issues · ${m.raised ? ((m.cat[i] / m.raised) * 100).toFixed(0) : 0}% of month`} />)}
          {m.raised > 0 && <div className="demo" style={{ marginTop: 12 }}>{topCat} is the largest category this month.</div>}
        </div>
      </div>

      <div className="grid c60-40">
        <div className="card">
          <h3>Zone-wise open issues</h3>
          <div className="note">Click a zone to open its issue register</div>
          {zrows.length === 0 && <div className="empty">No open issues in any zone.</div>}
          {zrows.map((z) => <BarRow key={z.id} name={z.name} value={z.open} max={zrows[0].open} color={scoreColor(z.score, d.min_score)}
            tip={`<b>${z.name}</b><br>${z.open} open · 5S score ${z.score}%`} onClick={() => nav(`/issues?zone=${z.id}&status=Open`)} />)}
          <div className="demo" style={{ marginTop: 12 }}>Bar colour is the zone’s 5S score band, not its issue count.</div>
        </div>
        <div className="card">
          <h3>Issue ageing</h3>
          <div className="note">How long the {ageTot} open issues have been waiting</div>
          <div className="stack">
            {d.ageing.map((a, i) => <span key={a.label} style={{ background: AGE_COLORS[i], width: `${ageTot ? (a.value / ageTot) * 100 : 0}%` }} data-tip={`<b>${a.label}</b><br>${a.value} issues`} />)}
          </div>
          <div className="legrid">
            {d.ageing.map((a, i) => <div className="leg" key={a.label}><i style={{ background: AGE_COLORS[i] }} />{a.label}<b>{a.value}</b></div>)}
          </div>
          <div className="demo" style={{ marginTop: 16 }}>{d.ageing[3].value} issues are past 30 days and have escalated to the Factory Manager.</div>
        </div>
      </div>

      <div className="grid c50">
        <div className="card">
          <h3>Repeat issues</h3>
          <div className="note">Same problem, same zone, raised in three or more audits</div>
          {d.repeats.length === 0 && <div className="empty">No repeat findings yet.</div>}
          {d.repeats.map((r) => (
            <div className="repeat" key={r.zone + r.desc}>
              <Pill cls="p-blue">{r.cat}</Pill>
              <div><div className="txt">{r.desc}</div><div className="mt">{r.zone} · {r.months.join(", ")}</div></div>
              <span className="ct pill p-red">×{r.n}</span>
            </div>))}
          <div className="demo" style={{ marginTop: 12 }}>A repeat is a CAPA failure, not an audit finding. These need a root cause, not another photo.</div>
        </div>
        <div className="card">
          <h3>Zone 5S scorecard</h3>
          <div className="note legend" style={{ gap: 14 }}>
            <span><i style={{ background: "var(--green)" }} />90 and above</span>
            <span><i style={{ background: "var(--amber)" }} />{d.min_score}–89</span>
            <span><i style={{ background: "var(--red)" }} />below {d.min_score}</span>
          </div>
          <div className="tw"><table>
            <thead><tr><th>Zone</th><th>Incharge</th><th className="num">Open</th><th className="num">Closed</th><th className="num">Score</th></tr></thead>
            <tbody>{[...d.zones].sort((a, b) => b.score - a.score).map((z) => (
              <tr key={z.id}><td className="strong">{z.name}</td><td className="rowsub">{z.incharge}</td>
                <td className="num">{z.open}</td><td className="num">{z.closed}</td>
                <td className="num"><Pill cls={scorePill(z.score, d.min_score)}>{z.score}%</Pill></td></tr>))}
            </tbody></table></div>
        </div>
      </div>

      <div className="grid c50">
        <div className="card">
          <h3>Auditor performance</h3>
          <div className="note">Audits completed and issues raised in {monthName(m.label)}</div>
          {d.leaders.length === 0 && <div className="empty">No audits completed this month yet.</div>}
          {d.leaders.map((a, i) => (
            <div className="lead" key={a.name}>
              <span className="rank">{i + 1}</span>
              <div className="av sm">{ini(a.name)}</div>
              <div><div className="nm">{a.name}</div><div className="mt">{a.audits} audits · {a.issues} issues raised</div></div>
              <div className="sc"><b>{a.on_time}%</b><span>on schedule</span></div>
            </div>))}
        </div>
        <div className="card">
          <h3>Latest issues</h3>
          <div className="note">Most recent findings across all zones</div>
          <div className="tw"><table>
            <thead><tr><th>Issue</th><th>Zone</th><th>Category</th><th>Status</th></tr></thead>
            <tbody>{d.latest.map((i) => (
              <tr key={i.id}><td><div className="strong">{i.description}</div><div className="rowsub mono">{i.code}</div></td>
                <td>{i.zone}</td><td><Pill cls="p-blue">{i.category}</Pill></td>
                <td><Pill cls={statusPill(i.status)}>{i.status.toUpperCase()}</Pill></td></tr>))}
            </tbody></table></div>
        </div>
      </div>
    </>
  );
}
