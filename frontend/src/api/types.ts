export type Role = "Super Admin" | "5S Incharge" | "Auditor";

export interface User { id: number; emp_id: string; name: string; role: Role; email: string | null; zone_id: number | null; zone: string; status: "Active" | "Inactive"; }
export interface Issue {
  id: number; code: string; zone_id: number; zone: string; category: string; category_full: string;
  description: string; priority: "Critical" | "Major" | "Minor"; status: "Open" | "Closed";
  raised_by: string; raised_at: string; raised_on: string; closed_at: string | null; closed_by: string | null;
  days: number; escalation_level: number; repeat: number;
  before_photo: string | null; after_photo: string | null; closure_note: string | null;
}
export interface Zone { id: number; name: string; checkpoints: number; incharge_id: number | null; incharge: string | null; qr_token: string; open: number; closed: number; findings: number; avg_closure: number | null; }
export interface Audit { id: number; zone_id: number; zone: string; cycle: string; planned_date: string; status: "Scheduled" | "Completed" | "Missed" | "Due today" | "Unassigned"; missed_reason: string | null; auditors: { id: number; name: string }[]; submitted_by: string | null; submitted_by_id: number | null; completed_at: string | null; }
export interface Month { key: string; label: string; raised: number; closed: number; open: number; overdue: number; avg: number; comp: number; audits_done: number; audits_total: number; cat: number[]; }
export interface Dashboard {
  cycle: string; label: string; months: Month[]; current: Month;
  zones: { id: number; name: string; incharge: string; open: number; closed: number; findings: number }[];
  ageing: { label: string; value: number }[];
  repeats: { zone: string; desc: string; cat: string; n: number; months: string[] }[];
  leaders: { name: string; audits: number; issues: number; on_time: number }[];
  latest: Issue[]; zone_count: number; auditor_count: number; closure_target: number; overdue_days: number;
}
export interface Report { from: string; to: string; months: Month[]; total: number; closed: number; open: number; avg_closure: number | null; issues: Issue[]; closure_target: number; overdue_days: number; }
export interface Meta {
  cycles: { key: string; label: string }[]; current_cycle: string;
  zones: { id: number; name: string }[]; auditors: { id: number; name: string; zone: string | null }[];
  categories: { key: string; label: string }[]; open_issues: number; escalated: number; online: number;
}
export interface Settings {
  escalation_days: number[]; closure_target_days: number; min_score: number; audits_per_zone_per_month: number;
  notifications: Record<string, boolean>; integrity: Record<string, boolean>;
}
export interface LiveEvent { topic: string; data: Record<string, any>; at?: string; }
export interface Finding { id: number; audit_id: number; category: string; remark: string; photo_url: string; recorded_at: string | null; }
export interface GalleryFinding extends Finding { zone_id: number; zone: string; auditors: string; }
export interface AuditsResponse { cycle: string; today: string; items: Audit[]; }
