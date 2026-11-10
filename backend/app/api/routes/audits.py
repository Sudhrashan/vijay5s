from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import admin_only, anyone, staff
from app.db.session import get_db
from app.models import Audit, Finding, User, Zone
from app.realtime.hub import hub
from app.schemas.inputs import AllocationIn, AuditIn, AuditPatch, CycleIn, FindingIn
from app.services import settings_service
from app.services.findings import delete_issue_and_findings, open_issue_for_finding
from app.services.storage import delete_photo
from app.services.serializers import audit_out, finding_out
from app.services.stats import current_cycle
from app.services.storage import save_photo

router = APIRouter(tags=["audits"])


def _auditors(db: Session, ids: list[int]) -> list[User]:
    users = db.query(User).filter(User.id.in_(ids), User.role == "Auditor", User.active.is_(True)).all() if ids else []
    if len(users) != len(set(ids)):
        raise HTTPException(400, "Only active auditors can be assigned")
    return users


@router.get("/audits", dependencies=[Depends(anyone)])
def list_audits(cycle: str | None = None, db: Session = Depends(get_db)):
    cyc = cycle or current_cycle()
    rows = db.query(Audit).filter(Audit.cycle == cyc).order_by(Audit.planned_date, Audit.zone_id).all()
    return {"cycle": cyc, "today": date.today().isoformat(), "items": [audit_out(a) for a in rows]}


@router.post("/audits", status_code=201, dependencies=[Depends(staff)])
def schedule_audit(body: AuditIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    if not db.get(Zone, body.zone_id):
        raise HTTPException(404, "Zone not found")
    a = Audit(zone_id=body.zone_id, cycle=body.planned_date.strftime("%Y-%m"), planned_date=body.planned_date)
    a.auditors = _auditors(db, body.auditor_ids)
    db.add(a)
    db.commit()
    db.refresh(a)
    bg.add_task(hub.publish, "audit.changed", {"zone": a.zone.name, "action": "scheduled"})
    return audit_out(a)


@router.patch("/audits/{audit_id}")
def update_audit(audit_id: int, body: AuditPatch, bg: BackgroundTasks,
                 user: User = Depends(staff), db: Session = Depends(get_db)):
    a = db.get(Audit, audit_id)
    if not a:
        raise HTTPException(404, "Audit not found")
    data = body.model_dump(exclude_unset=True)
    if "planned_date" in data:
        a.planned_date = data["planned_date"]
        a.cycle = a.planned_date.strftime("%Y-%m")
        if a.status == "Missed":
            a.status = "Scheduled"  # rescheduling a missed audit puts it back on the plan
    if st := data.get("status"):
        if st not in ("Scheduled", "Completed", "Missed"):
            raise HTTPException(400, "Status must be Scheduled, Completed or Missed")
        if st == "Missed" and not (data.get("missed_reason") or a.missed_reason):
            raise HTTPException(400, "A missed audit needs a reason")
        a.status = st
        a.completed_at = datetime.now() if st == "Completed" else None
        a.submitted_by_id = user.id if st == "Completed" else None
    if "missed_reason" in data:
        a.missed_reason = data["missed_reason"]
    db.commit()
    db.refresh(a)
    bg.add_task(hub.publish, "audit.changed", {"zone": a.zone.name, "action": a.status.lower()})
    return audit_out(a)


def _audit_for(db: Session, audit_id: int, user: User) -> Audit:
    a = db.get(Audit, audit_id)
    if not a:
        raise HTTPException(404, "Audit not found")
    if user.role == "Auditor" and user.id not in {u.id for u in a.auditors}:
        raise HTTPException(403, "This audit is not assigned to you. Ask your 5S admin to allocate it.")
    return a


@router.get("/audits/{audit_id}/findings", dependencies=[Depends(anyone)])
def list_findings(audit_id: int, user: User = Depends(anyone), db: Session = Depends(get_db)):
    _audit_for(db, audit_id, user)
    rows = db.query(Finding).filter(Finding.audit_id == audit_id).order_by(Finding.id).all()
    return {"items": [finding_out(f) for f in rows]}


@router.get("/findings", dependencies=[Depends(staff)])
def all_findings(cycle: str | None = None, zone_id: int | None = None, category: str | None = None,
                 db: Session = Depends(get_db)):
    """Every finding in a cycle across all zones, for the admin photo gallery."""
    cyc = cycle or current_cycle()
    q = db.query(Finding, Audit).join(Audit, Finding.audit_id == Audit.id).filter(Audit.cycle == cyc)
    if zone_id:
        q = q.filter(Audit.zone_id == zone_id)
    if category:
        q = q.filter(Finding.category == category)
    items = [{**finding_out(f), "zone_id": a.zone_id, "zone": a.zone.name,
              "auditors": ", ".join(u.name for u in a.auditors)}
             for f, a in q.order_by(Finding.id.desc()).all()]
    return {"cycle": cyc, "items": items}


@router.post("/audits/{audit_id}/findings", status_code=201)
def add_finding(audit_id: int, bg: BackgroundTasks, category: str = Form(...), remark: str = Form(...),
               photo: UploadFile = File(...), user: User = Depends(anyone), db: Session = Depends(get_db)):
    a = _audit_for(db, audit_id, user)
    try:
        body = FindingIn(category=category, remark=remark)
    except ValidationError as e:
        msg = "; ".join(err["msg"] for err in e.errors())
        raise HTTPException(422, msg) from e
    photo_url = save_photo(photo)
    remark = body.remark.strip()
    issue = open_issue_for_finding(db, a, body.category, remark, photo_url, user.id)
    finding = Finding(audit_id=a.id, category=body.category, remark=remark, photo_url=photo_url, issue_id=issue.id)
    db.add(finding)
    db.commit()
    db.refresh(finding)
    bg.add_task(hub.publish, "audit.changed", {"audit_id": audit_id, "zone": a.zone.name, "action": "finding"})
    bg.add_task(hub.publish, "issue.created", {"code": issue.code, "zone": a.zone.name,
                                               "description": remark, "by": user.name})
    return finding_out(finding)


@router.delete("/findings/{finding_id}")
def delete_finding(finding_id: int, bg: BackgroundTasks, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Super Admin only. Removes the finding, the issue opened for it, and their photos."""
    f = db.get(Finding, finding_id)
    if not f:
        raise HTTPException(404, "Photo not found. It may already have been deleted.")
    issue, audit_id = f.issue, f.audit_id
    a = db.get(Audit, audit_id)
    zone = a.zone.name if a else ""
    code = issue.code if issue else None
    for url in delete_issue_and_findings(db, issue, f):
        bg.add_task(delete_photo, url)
    bg.add_task(hub.publish, "audit.changed", {"audit_id": audit_id, "zone": zone, "action": "finding deleted"})
    if code:
        bg.add_task(hub.publish, "issue.deleted", {"code": code, "zone": zone, "by": user.name})
    return {"ok": True}


@router.post("/audits/{audit_id}/complete")
def complete_audit(audit_id: int, bg: BackgroundTasks,
                   user: User = Depends(anyone), db: Session = Depends(get_db)):
    a = _audit_for(db, audit_id, user)
    count = db.query(Finding).filter(Finding.audit_id == audit_id).count()
    if count == 0:
        raise HTTPException(400, "Log at least one finding before submitting this audit")
    # Two auditors may complete the same zone on two phones; a conditional UPDATE lets exactly one win.
    now = datetime.now()
    claimed = (db.query(Audit).filter(Audit.id == audit_id, Audit.status != "Completed")
               .update({"status": "Completed", "completed_at": now, "submitted_by_id": user.id},
                       synchronize_session=False))
    if not claimed:
        db.rollback()
        db.refresh(a)
        who = f"by {a.submitted_by.name}" if a.submitted_by else "(your co-auditor may have done it)"
        raise HTTPException(409, f"This audit has already been submitted {who}. Go back to Home to see the findings.")
    db.commit()
    db.refresh(a)
    bg.add_task(hub.publish, "audit.changed", {"zone": a.zone.name, "action": "completed"})
    return audit_out(a)


@router.put("/allocation", dependencies=[Depends(staff)])
def save_allocation(body: AllocationIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    changed = 0
    for row in body.rows:
        a = db.get(Audit, row.audit_id)
        if not a:
            raise HTTPException(404, f"Audit {row.audit_id} not found")
        new = _auditors(db, row.auditor_ids)
        if {u.id for u in new} != {u.id for u in a.auditors}:
            a.auditors = new
            changed += 1
    db.commit()
    assigned = sum(1 for r in body.rows if r.auditor_ids)
    # Hook point: notify each newly assigned auditor (settings.notifications.audit_assigned).
    bg.add_task(hub.publish, "allocation.saved", {"zones": assigned, "changed": changed})
    return {"assigned": assigned, "changed": changed}


@router.post("/audits/cycle", status_code=201, dependencies=[Depends(staff)])
def start_cycle(body: CycleIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    if db.query(Audit).filter(Audit.cycle == body.cycle).first():
        raise HTTPException(409, f"The {body.cycle} audit cycle already exists")
    per = int(settings_service.get_all(db)["audits_per_zone_per_month"])
    y, m = map(int, body.cycle.split("-"))
    created = 0
    for zi, z in enumerate(db.query(Zone).order_by(Zone.name)):
        for slot in range(per):
            day = min(28, 3 + (zi * 2) % 12 + slot * (26 // max(per, 1)))
            db.add(Audit(zone_id=z.id, cycle=body.cycle, planned_date=date(y, m, day)))
            created += 1
    db.commit()
    bg.add_task(hub.publish, "audit.changed", {"action": "cycle", "cycle": body.cycle, "count": created})
    return {"cycle": body.cycle, "created": created}
