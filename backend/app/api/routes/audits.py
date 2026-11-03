from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import anyone, staff
from app.db.session import get_db
from app.models import Audit, AuditResponse, Checkpoint, User, Zone
from app.realtime.hub import hub
from app.schemas.inputs import AllocationIn, AuditIn, AuditPatch, AuditSubmitIn, CycleIn
from app.services import settings_service
from app.services.serializers import audit_out, audit_response_out, checkpoint_out
from app.services.stats import current_cycle
from app.services.storage import save_photo

router = APIRouter(tags=["audits"])

CHECKLIST_MAX = 68  # 34 checkpoints x 2 points, per the ROE004 printed checklist


def _auditors(db: Session, ids: list[int]) -> list[User]:
    users = db.query(User).filter(User.id.in_(ids), User.role == "Auditor", User.active.is_(True)).all() if ids else []
    if len(users) != len(set(ids)):
        raise HTTPException(400, "Only active auditors can be assigned")
    return users


@router.get("/checkpoints", dependencies=[Depends(anyone)])
def list_checkpoints(db: Session = Depends(get_db)):
    rows = db.query(Checkpoint).order_by(Checkpoint.category, Checkpoint.order).all()
    return {"max_score": CHECKLIST_MAX, "items": [checkpoint_out(c) for c in rows]}


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
    if "score" in data:
        a.score = data["score"]
    if "missed_reason" in data:
        a.missed_reason = data["missed_reason"]
    db.commit()
    db.refresh(a)
    bg.add_task(hub.publish, "audit.changed", {"zone": a.zone.name, "action": a.status.lower()})
    return audit_out(a)


@router.get("/audits/{audit_id}/responses", dependencies=[Depends(anyone)])
def get_audit_responses(audit_id: int, db: Session = Depends(get_db)):
    if not db.get(Audit, audit_id):
        raise HTTPException(404, "Audit not found")
    rows = (db.query(AuditResponse).filter(AuditResponse.audit_id == audit_id)
            .join(Checkpoint).order_by(Checkpoint.category, Checkpoint.order).all())
    return {"items": [audit_response_out(r) for r in rows]}


def _audit_for(db: Session, audit_id: int, user: User) -> Audit:
    a = db.get(Audit, audit_id)
    if not a:
        raise HTTPException(404, "Audit not found")
    if user.role == "Auditor" and user.id not in {u.id for u in a.auditors}:
        raise HTTPException(403, "This audit is not assigned to you. Ask your 5S admin to allocate it.")
    return a


@router.post("/audits/{audit_id}/responses")
def submit_audit_responses(audit_id: int, body: AuditSubmitIn, bg: BackgroundTasks,
                           user: User = Depends(anyone), db: Session = Depends(get_db)):
    a = _audit_for(db, audit_id, user)
    ids = [r.checkpoint_id for r in body.responses]
    found = {c.id for c in db.query(Checkpoint).filter(Checkpoint.id.in_(ids)).all()}
    if len(found) != len(set(ids)):
        raise HTTPException(400, "One or more checkpoints are not recognised")
    # Two auditors may score the same zone on two phones; a conditional UPDATE lets exactly one submit win.
    now = datetime.now()
    claimed = (db.query(Audit).filter(Audit.id == audit_id, Audit.status != "Completed")
               .update({"status": "Completed", "completed_at": now, "submitted_by_id": user.id},
                       synchronize_session=False))
    if not claimed:
        db.rollback()
        db.refresh(a)
        who = f"by {a.submitted_by.name}" if a.submitted_by else "(your co-auditor may have done it)"
        raise HTTPException(409, f"This audit has already been submitted {who}. Go back to Home to see the score.")
    db.query(AuditResponse).filter(AuditResponse.audit_id == audit_id).delete()
    for r in body.responses:
        db.add(AuditResponse(audit_id=audit_id, checkpoint_id=r.checkpoint_id, score=r.score))
    total = sum(r.score for r in body.responses)
    a.status, a.completed_at, a.submitted_by_id = "Completed", now, user.id
    a.score = round(total / CHECKLIST_MAX * 100)
    db.commit()
    db.refresh(a)
    bg.add_task(hub.publish, "audit.changed", {"zone": a.zone.name, "action": "completed"})
    return audit_out(a)


@router.post("/audits/{audit_id}/responses/{checkpoint_id}/photo")
def add_response_photo(audit_id: int, checkpoint_id: int, bg: BackgroundTasks,
                       photo: UploadFile = File(...), user: User = Depends(anyone), db: Session = Depends(get_db)):
    _audit_for(db, audit_id, user)
    resp = (db.query(AuditResponse)
            .filter(AuditResponse.audit_id == audit_id, AuditResponse.checkpoint_id == checkpoint_id).first())
    if not resp:
        raise HTTPException(404, "Submit a score for this checkpoint before attaching a photo")
    resp.photo_url = save_photo(photo)
    db.commit()
    bg.add_task(hub.publish, "audit.changed", {"audit_id": audit_id, "action": "photo"})
    return {"checkpoint_id": checkpoint_id, "photo_url": resp.photo_url}


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
