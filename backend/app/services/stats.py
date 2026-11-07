"""Dashboard and report numbers, computed from the live tables.

Plant scale (a few thousand issues a year) is small enough to aggregate in Python, which
keeps the logic readable and database-agnostic. If volumes grow by 100x, move the monthly
roll-ups into SQL views or a nightly materialised table.
"""
import calendar
from collections import Counter, defaultdict
from datetime import date, datetime, time

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import CATEGORIES, Audit, Finding, Issue, User, Zone
from app.services import settings_service
from app.services.serializers import days_open, issue_out

CATK = list(CATEGORIES.keys())


def cycle_label(cycle: str) -> str:
    y, m = map(int, cycle.split("-"))
    return f"{calendar.month_name[m]} {y}"


def month_bounds(cycle: str) -> tuple[datetime, datetime]:
    y, m = map(int, cycle.split("-"))
    start = datetime(y, m, 1)
    end = datetime.combine(date(y, m, calendar.monthrange(y, m)[1]), time.max)
    return start, min(end, datetime.now())


def shift(cycle: str, n: int) -> str:
    y, m = map(int, cycle.split("-"))
    idx = y * 12 + (m - 1) + n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def current_cycle() -> str:
    return date.today().strftime("%Y-%m")


def available_cycles(db: Session) -> list[dict]:
    first = db.query(Issue.raised_at).order_by(Issue.raised_at).first()
    start = first[0].strftime("%Y-%m") if first else current_cycle()
    cur, out = current_cycle(), []
    c = start
    while c <= cur:
        out.append({"key": c, "label": cycle_label(c)})
        c = shift(c, 1)
    return out[-12:]


def _open_at(i: Issue, t: datetime) -> bool:
    return i.raised_at <= t and (i.closed_at is None or i.closed_at > t)


def _age_at(i: Issue, t: datetime) -> int:
    return max(1, (t.date() - i.raised_at.date()).days)


def finding_rows(db: Session) -> list:
    """(audit_id, cycle, zone_id, category) for every finding, live -- not just submitted audits."""
    return (db.query(Audit.id.label("audit_id"), Audit.cycle, Audit.zone_id, Finding.category)
            .join(Finding, Finding.audit_id == Audit.id).all())


def month_summary(cycle: str, issues: list[Issue], audits: list[Audit], overdue_days: int,
                  findings: list | tuple = ()) -> dict:
    start, end = month_bounds(cycle)
    fcat = Counter(f.category for f in findings if f.cycle == cycle)
    raised = [i for i in issues if start <= i.raised_at <= end]
    closed = [i for i in issues if i.closed_at and start <= i.closed_at <= end]
    open_now = [i for i in issues if _open_at(i, end)]
    cyc_audits = [a for a in audits if a.cycle == cycle]
    done = sum(1 for a in cyc_audits if a.status == "Completed")
    cat = Counter(i.category for i in raised)
    return {
        "key": cycle, "label": cycle_label(cycle),
        "raised": len(raised), "closed": len(closed), "open": len(open_now),
        "overdue": sum(1 for i in open_now if _age_at(i, end) > overdue_days),
        "avg": round(sum(days_open(i) for i in closed) / len(closed), 1) if closed else 0,
        "comp": round(done / len(cyc_audits) * 100) if cyc_audits else 0,
        "audits_done": done, "audits_total": len(cyc_audits),
        "cat": [cat.get(k, 0) for k in CATK],
        "findings": sum(fcat.values()),
        "fcat": [fcat.get(k, 0) for k in CATK],
    }


def zone_finding_counts(db: Session, audits: list[Audit], cycle: str) -> dict[int, int]:
    """Findings logged against each zone's audits in the cycle, counted as soon as they are logged."""
    cyc_audit_ids = {a.id: a.zone_id for a in audits if a.cycle == cycle}
    if not cyc_audit_ids:
        return {}
    counts: dict[int, int] = defaultdict(int)
    rows = (db.query(Finding.audit_id, func.count(Finding.id))
            .filter(Finding.audit_id.in_(cyc_audit_ids.keys())).group_by(Finding.audit_id).all())
    for audit_id, n in rows:
        counts[cyc_audit_ids[audit_id]] += n
    return dict(counts)


def repeat_counts(issues: list[Issue]) -> dict[tuple, int]:
    return Counter((i.zone_id, i.description.strip().lower()) for i in issues)


def dashboard(db: Session, cycle: str) -> dict:
    cfg = settings_service.get_all(db)
    overdue_days = cfg["escalation_days"][1]
    issues = db.query(Issue).all()
    audits = db.query(Audit).all()
    zones = db.query(Zone).order_by(Zone.name).all()
    _, end = month_bounds(cycle)

    frows = finding_rows(db)
    months = [month_summary(shift(cycle, k), issues, audits, overdue_days, frows) for k in range(-5, 1)]
    cur = months[-1]

    open_now = [i for i in issues if _open_at(i, end)]
    findings = zone_finding_counts(db, audits, cycle)
    zone_open = Counter(i.zone_id for i in open_now)
    zone_closed = Counter(i.zone_id for i in issues if i.closed_at and i.closed_at <= end)
    zone_rows = [{
        "id": z.id, "name": z.name, "incharge": z.incharge.name.split(" ")[0] if z.incharge else "—",
        "open": zone_open.get(z.id, 0), "closed": zone_closed.get(z.id, 0),
        "findings": findings.get(z.id, 0),
    } for z in zones]

    buckets = [("0–7 days", 0, 7), ("8–15 days", 8, 15), ("16–30 days", 16, 30), ("30+ days", 31, 10**6)]
    ages = [_age_at(i, end) for i in open_now]
    ageing = [{"label": l, "value": sum(1 for a in ages if lo <= a <= hi)} for l, lo, hi in buckets]

    upto = [i for i in issues if i.raised_at <= end]
    groups: dict[tuple, list[Issue]] = defaultdict(list)
    for i in upto:
        groups[(i.zone_id, i.description.strip().lower())].append(i)
    repeats = sorted(
        ({"zone": g[0].zone.name, "desc": g[0].description, "cat": g[0].category, "n": len(g),
          "months": sorted({x.raised_at.strftime("%b") for x in g},
                           key=lambda m: list(calendar.month_abbr).index(m))}
         for g in groups.values() if len(g) >= 3),
        key=lambda r: -r["n"])[:5]

    start, _ = month_bounds(cycle)
    cyc_audits = [a for a in audits if a.cycle == cycle]
    per_audit = Counter(f.audit_id for f in frows if f.cycle == cycle)
    lead: dict[int, dict] = {}
    for a in cyc_audits:
        for u in a.auditors:
            row = lead.setdefault(u.id, {"name": u.name, "audits": 0, "missed": 0, "issues": 0, "findings": 0})
            row["audits"] += a.status == "Completed"
            row["missed"] += a.status == "Missed"
            row["findings"] += per_audit.get(a.id, 0)
    for i in issues:
        if start <= i.raised_at <= end and i.raised_by_id in lead:
            lead[i.raised_by_id]["issues"] += 1
    leaders = []
    for r in lead.values():
        decided = r["audits"] + r["missed"]
        leaders.append({**r, "on_time": round(r["audits"] / decided * 100) if decided else 100})
    leaders.sort(key=lambda r: (-r["audits"], -r["findings"], -r["issues"]))

    latest = sorted(upto, key=lambda i: i.raised_at, reverse=True)[:6]
    rc = repeat_counts(issues)

    return {
        "cycle": cycle, "label": cur["label"], "months": months, "current": cur,
        "zones": zone_rows, "ageing": ageing, "repeats": repeats, "leaders": leaders[:6],
        "latest": [issue_out(i, rc[(i.zone_id, i.description.strip().lower())]) for i in latest],
        "zone_count": len(zones),
        "auditor_count": db.query(User).filter(User.role == "Auditor", User.active.is_(True)).count(),
        "closure_target": cfg["closure_target_days"], "overdue_days": overdue_days,
    }


def report(db: Session, frm: str, to: str, zone_id: int | None, auditor_id: int | None,
           category: str | None, status: str | None) -> dict:
    if frm > to:
        frm, to = to, frm
    cfg = settings_service.get_all(db)
    issues = db.query(Issue).all()
    audits = db.query(Audit).all()
    cycles, c = [], frm
    while c <= to:
        cycles.append(c)
        c = shift(c, 1)
    # The monthly trend must honour the same scope as the issue list, or a zone-filtered report
    # (e.g. an incharge's own zone) shows plant-wide numbers.
    m_issues = [i for i in issues
                if (zone_id is None or i.zone_id == zone_id)
                and (auditor_id is None or i.raised_by_id == auditor_id)
                and (category is None or i.category == category)]
    m_audits = [a for a in audits if zone_id is None or a.zone_id == zone_id]
    m_findings = [f for f in finding_rows(db)
                  if (zone_id is None or f.zone_id == zone_id) and (category is None or f.category == category)]
    months = [month_summary(c, m_issues, m_audits, cfg["escalation_days"][1], m_findings) for c in cycles]

    start, _ = month_bounds(frm)
    _, end = month_bounds(to)
    rows = [i for i in issues if start <= i.raised_at <= end
            and (zone_id is None or i.zone_id == zone_id)
            and (auditor_id is None or i.raised_by_id == auditor_id)
            and (category is None or i.category == category)
            and (status is None or i.status == status)]
    rows.sort(key=lambda i: i.raised_at, reverse=True)
    closed = [i for i in rows if i.status == "Closed"]
    rc = repeat_counts(issues)
    return {
        "from": frm, "to": to, "months": months,
        "total": len(rows), "closed": len(closed), "open": len(rows) - len(closed),
        "avg_closure": round(sum(days_open(i) for i in closed) / len(closed), 1) if closed else None,
        "issues": [issue_out(i, rc[(i.zone_id, i.description.strip().lower())]) for i in rows],
        "closure_target": cfg["closure_target_days"], "overdue_days": cfg["escalation_days"][1],
    }
