// Hand-built SVG charts ported 1:1 from the prototype, so the look is unchanged and no
// chart library is needed. Hover text uses the global data-tip tooltip (see Tip.tsx).

function bar(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
const niceMax = (v: number) => Math.max(20, Math.ceil(v / 20) * 20);

export function GroupedChart({ rows }: { rows: { l: string; open: number; closed: number }[] }) {
  const W = 620, H = 260, L = 40, R = 8, T = 16, B = 30;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.open, r.closed))));
  const pw = W - L - R, ph = H - T - B;
  const y = (v: number) => T + ph - (v / max) * ph;
  const gw = pw / rows.length, bw = 17, gap = 5;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Open versus closed issues by month">
      {[0, 1, 2, 3, 4].map((i) => { const v = (max * i) / 4; return (
        <g key={i}><line className="gl" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>); })}
      {rows.map((r, i) => {
        const cx = L + gw * i + gw / 2, x1 = cx - bw - gap / 2, x2 = cx + gap / 2;
        return (
          <g key={r.l + i}>
            <path d={bar(x1, y(r.open), bw, ph - (y(r.open) - T), 4)} style={{ fill: "var(--red)" }} data-tip={`<b>${r.l}</b><br>Open ${r.open}`} />
            <path d={bar(x2, y(r.closed), bw, ph - (y(r.closed) - T), 4)} style={{ fill: "var(--green)" }} data-tip={`<b>${r.l}</b><br>Closed ${r.closed}`} />
            <text x={cx} y={H - 10} textAnchor="middle">{r.l}</text>
          </g>);
      })}
    </svg>
  );
}

export function LineChart({ rows }: { rows: { l: string; a: number; b: number }[] }) {
  const W = 620, H = 250, L = 40, R = 14, T = 16, B = 30;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.a, r.b))));
  const pw = W - L - R, ph = H - T - B;
  const x = (i: number) => (rows.length === 1 ? L + pw / 2 : L + pw * (i / (rows.length - 1)));
  const y = (v: number) => T + ph - (v / max) * ph;
  const path = (k: "a" | "b") => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(" ");
  const area = `${path("a")} L${x(rows.length - 1)},${T + ph} L${x(0)},${T + ph} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly trend of issues raised and closed">
      {[0, 1, 2, 3, 4].map((i) => { const v = (max * i) / 4; return (
        <g key={i}><line className="gl" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>); })}
      <path d={area} style={{ fill: "var(--blue)" }} opacity=".08" />
      <path d={path("a")} fill="none" style={{ stroke: "var(--blue)" }} strokeWidth="2.5" strokeLinejoin="round" />
      <path d={path("b")} fill="none" style={{ stroke: "var(--green)" }} strokeWidth="2.5" strokeLinejoin="round" />
      {rows.map((r, i) => (
        <g key={r.l + i}>
          <circle cx={x(i)} cy={y(r.a)} r="4.5" style={{ fill: "var(--blue)", stroke: "var(--card)" }} strokeWidth="2" data-tip={`<b>${r.l}</b><br>Raised ${r.a}`} />
          <circle cx={x(i)} cy={y(r.b)} r="4.5" style={{ fill: "var(--green)", stroke: "var(--card)" }} strokeWidth="2" data-tip={`<b>${r.l}</b><br>Closed ${r.b}`} />
          <text x={x(i)} y={H - 10} textAnchor="middle">{r.l}</text>
        </g>))}
    </svg>
  );
}

export function Sparkline({ vals, color }: { vals: number[]; color: string }) {
  const W = 120, H = 26, p = 2;
  if (vals.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pt = (v: number, i: number) => [p + (W - 2 * p) * (i / (vals.length - 1)), H - p - (H - 2 * p) * ((v - mn) / rg)];
  const d = vals.map((v, i) => { const [a, b] = pt(v, i); return `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`; }).join(" ");
  const [lx, ly] = pt(vals[vals.length - 1], vals.length - 1);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="2.6" style={{ fill: color }} />
    </svg>
  );
}

export function Ring({ score, color }: { score: number | null; color: string }) {
  const r = 18, c = 2 * Math.PI * r, s = score ?? 0;
  return (
    <svg className="ring" viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="23" r={r} fill="none" style={{ stroke: "var(--t-grey)" }} strokeWidth="4" />
      <circle cx="23" cy="23" r={r} fill="none" style={{ stroke: color }} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${((c * s) / 100).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 23 23)" />
      <text x="23" y="27" textAnchor="middle">{score ?? "—"}</text>
    </svg>
  );
}

export function BarRow({ name, value, max, color, tip, onClick }:
  { name: string; value: number | string; max: number; color?: string; tip?: string; onClick?: () => void }) {
  const v = typeof value === "number" ? value : parseFloat(value);
  return (
    <div className="barrow" data-tip={tip} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}>
      <div className="nm">{name}</div>
      <div className="track"><div className="fill" style={{ width: `${max ? Math.min(100, (v / max) * 100) : 0}%`, background: color }} /></div>
      <div className="n">{value}</div>
    </div>
  );
}
