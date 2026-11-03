import { useEffect, type ReactNode } from "react";
import { Sparkline } from "./Charts";
import { Icon } from "./Icons";

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button onClick={onClose} aria-label="Close">×</button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Select<T extends string | number>({ id, value, onChange, options, label }:
  { id?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return (
    <select id={id} aria-label={label} value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find((o) => String(o.value) === raw);
        onChange((match ? match.value : raw) as T);
      }}>
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fg"><span>{label}</span>{children}</div>;
}

export function Pill({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`pill ${cls}`}>{children}</span>;
}

export function Kpi({ label, value, tint, color, icon, trend, spark }:
  { label: string; value: ReactNode; tint: string; color: string; icon: string; trend: ReactNode; spark: number[] }) {
  return (
    <div className="kpi">
      <div className="ic" style={{ background: tint }}><Icon d={icon} color={color} /></div>
      <div className="lab">{label}</div>
      <div className="v">{value}</div>
      <div className="tr">{trend}</div>
      <Sparkline vals={spark} color={color} />
    </div>
  );
}

export function SortTh<K extends string>({ k, label, sort, dir, onSort, num }:
  { k: K; label: string; sort: K; dir: 1 | -1; onSort: (k: K) => void; num?: boolean }) {
  return (
    <th className={`s ${num ? "num" : ""}`} onClick={() => onSort(k)} aria-sort={sort === k ? (dir > 0 ? "ascending" : "descending") : "none"}>
      {label}{sort === k ? (dir > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="pagehead">
      <div><h2>{title}</h2><div className="sub">{sub}</div></div>
      {children && <div className="acts">{children}</div>}
    </div>
  );
}

export const Loading = () => <div className="loading">Loading live data…</div>;
export const ErrorBox = ({ error }: { error: unknown }) => (
  <div className="err">{error instanceof Error ? error.message : "Something went wrong loading this page"}</div>
);

/** Sort state helper shared by every sortable table. */
export function nextSort<K>(cur: { sort: K; dir: 1 | -1 }, k: K): { sort: K; dir: 1 | -1 } {
  return cur.sort === k ? { sort: k, dir: (cur.dir * -1) as 1 | -1 } : { sort: k, dir: 1 };
}
