export const ini = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const first = (n: string) => n.split(" ")[0];
export const scoreColor = (s: number, min = 75) => (s >= 90 ? "var(--green)" : s >= min ? "var(--amber)" : "var(--red)");
export const scorePill = (s: number, min = 75) => (s >= 90 ? "p-green" : s >= min ? "p-amber" : "p-red");
export const statusPill = (s: string) => (s === "Open" ? "p-red" : "p-green");
export const priPill = (p: string) => (p === "Critical" ? "p-red" : p === "Major" ? "p-amber" : "p-navy");
export const auditPill = (s: string) =>
  s === "Completed" ? "p-green" : s === "Missed" ? "p-red" : s === "Due today" ? "p-amber" : s === "Unassigned" ? "p-navy" : "p-blue";
export const shortMonth = (label: string) => label.slice(0, 3);
export const monthName = (label: string) => label.split(" ")[0];
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** "2 Nov, 10:42 am" — when an audit was submitted. */
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
/** "Ravi Kumar · 2 Nov, 10:42 am", or "" if the audit is not submitted yet. */
export const submittedLine = (a: { submitted_by: string | null; completed_at: string | null }) =>
  [a.submitted_by, a.completed_at && fmtDateTime(a.completed_at)].filter(Boolean).join(" · ");

export function sortBy<T>(rows: T[], key: keyof T, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const x = a[key] as unknown, y = b[key] as unknown;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    return String(x).localeCompare(String(y)) * dir;
  });
}
