from datetime import date, datetime

from app.models import CATEGORIES, Audit, AuditResponse, Checkpoint, Issue, User, Zone


def days_open(i: Issue, now: datetime | None = None) -> int:
    end = i.closed_at or (now or datetime.now())
    return max(1, (end.date() - i.raised_at.date()).days)


def user_out(u: User) -> dict:
    return {
        "id": u.id, "emp_id": u.emp_id, "name": u.name, "role": u.role, "email": u.email,
        "zone_id": u.zone_id, "zone": u.zone.name if u.zone else "All zones",
        "status": "Active" if u.active else "Inactive",
    }


def zone_out(z: Zone, open_: int = 0, closed: int = 0, score: int | None = None, avg: float | None = None) -> dict:
    return {
        "id": z.id, "name": z.name, "checkpoints": z.checkpoints,
        "incharge_id": z.incharge_id, "incharge": z.incharge.name if z.incharge else None,
        "qr_token": z.qr_token, "open": open_, "closed": closed, "score": score, "avg_closure": avg,
    }


def issue_out(i: Issue, repeat: int = 1) -> dict:
    return {
        "id": i.id, "code": i.code, "zone_id": i.zone_id, "zone": i.zone.name,
        "category": i.category, "category_full": CATEGORIES[i.category],
        "description": i.description, "priority": i.priority, "status": i.status,
        "raised_by": i.raised_by.name, "raised_at": i.raised_at.isoformat(),
        "raised_on": i.raised_at.date().isoformat(),
        "closed_at": i.closed_at.isoformat() if i.closed_at else None,
        "closed_by": i.closed_by.name if i.closed_by else None,
        "days": days_open(i), "escalation_level": i.escalation_level, "repeat": repeat,
        "before_photo": i.before_photo, "after_photo": i.after_photo, "closure_note": i.closure_note,
    }


def checkpoint_out(c: Checkpoint) -> dict:
    return {"id": c.id, "category": c.category, "order": c.order, "text": c.text}


def audit_response_out(r: AuditResponse) -> dict:
    return {
        "id": r.id, "checkpoint_id": r.checkpoint_id, "category": r.checkpoint.category,
        "score": float(r.score), "photo_url": r.photo_url,
    }


def audit_out(a: Audit, today: date | None = None) -> dict:
    return {
        "id": a.id, "zone_id": a.zone_id, "zone": a.zone.name, "cycle": a.cycle,
        "planned_date": a.planned_date.isoformat(),
        "status": a.display_status(today or date.today()),
        "score": a.score, "missed_reason": a.missed_reason,
        "auditors": [{"id": u.id, "name": u.name} for u in a.auditors],
        "submitted_by": a.submitted_by.name if a.submitted_by else None,
        "submitted_by_id": a.submitted_by_id,
        "completed_at": a.completed_at.isoformat(timespec="minutes") if a.completed_at else None,
    }
