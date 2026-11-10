import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import admin_only, anyone, staff
from app.db.session import get_db
from app.models import Issue, User, Zone
from app.realtime.hub import hub
from app.schemas.inputs import IssueIn
from app.services import settings_service
from app.services.serializers import issue_out
from app.services.stats import repeat_counts
from app.services.findings import delete_issue_and_findings
from app.services.storage import delete_photo, save_photo

router = APIRouter(prefix="/issues", tags=["issues"])


def _filtered(db: Session, zone_id, category, status, q):
    query = db.query(Issue).join(Zone).join(User, Issue.raised_by_id == User.id)
    if zone_id:
        query = query.filter(Issue.zone_id == zone_id)
    if category:
        query = query.filter(Issue.category == category)
    if status:
        query = query.filter(Issue.status == status)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(or_(func.lower(Issue.description).like(like), func.lower(Issue.code).like(like),
                                 func.lower(Zone.name).like(like), func.lower(User.name).like(like)))
    return query.order_by(Issue.raised_at.desc()).all()


@router.get("", dependencies=[Depends(anyone)])
def list_issues(zone_id: int | None = None, category: str | None = None, status: str | None = None,
                q: str | None = None, db: Session = Depends(get_db)):
    rows = _filtered(db, zone_id, category, status, q)
    rc = repeat_counts(db.query(Issue).all())
    return {"total": db.query(Issue).count(),
            "items": [issue_out(i, rc[(i.zone_id, i.description.strip().lower())]) for i in rows]}


@router.get("/export.csv", dependencies=[Depends(anyone)])
def export_csv(zone_id: int | None = None, category: str | None = None, status: str | None = None,
               q: str | None = None, db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Issue ID", "Finding", "Zone", "5S", "Priority", "Raised by", "Raised on", "Days open", "Status"])
    for i in _filtered(db, zone_id, category, status, q):
        o = issue_out(i)
        w.writerow([o["code"], o["description"], o["zone"], o["category"], o["priority"], o["raised_by"],
                    o["raised_on"], o["days"], o["status"]])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=vijay-5s-issues.csv"})


@router.post("", status_code=201)
def raise_issue(body: IssueIn, bg: BackgroundTasks, user: User = Depends(anyone), db: Session = Depends(get_db)):
    if not db.get(Zone, body.zone_id):
        raise HTTPException(404, "Zone not found")
    issue = Issue(code=f"TMP-{uuid.uuid4().hex[:12]}", zone_id=body.zone_id, audit_id=body.audit_id,
                  category=body.category, description=body.description.strip(), priority=body.priority,
                  status="Open", raised_by_id=user.id, raised_at=datetime.now())
    db.add(issue)
    db.flush()
    issue.code = f"VD-{1000 + issue.id}"  # derived from the row id, so parallel inserts never collide
    db.commit()
    db.refresh(issue)
    out = issue_out(issue)
    bg.add_task(hub.publish, "issue.created", {"code": out["code"], "zone": out["zone"],
                                               "description": out["description"], "by": user.name})
    return out


@router.post("/{issue_id}/photo")
def add_before_photo(issue_id: int, bg: BackgroundTasks, photo: UploadFile = File(...),
                     user: User = Depends(anyone), db: Session = Depends(get_db)):
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    if issue.status == "Closed":
        raise HTTPException(409, f"{issue.code} is closed. Reopen it before changing its photo.")
    if user.role == "Auditor" and issue.raised_by_id != user.id:
        raise HTTPException(403, "Only the person who raised this issue can add its before photo")
    issue.before_photo = save_photo(photo)
    db.commit()
    bg.add_task(hub.publish, "issue.updated", {"code": issue.code})
    return issue_out(issue)


def _issue_in_scope(db: Session, issue_id: int, user: User) -> Issue:
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    if user.role == "5S Incharge" and issue.zone_id != user.zone_id and issue.zone.incharge_id != user.id:
        raise HTTPException(403, "You can only close or reopen issues in your own zone")
    return issue


@router.post("/{issue_id}/close")
def close_issue(issue_id: int, bg: BackgroundTasks, note: str = Form(""),
                after_photo: UploadFile | None = File(None),
                user: User = Depends(staff), db: Session = Depends(get_db)):
    issue = _issue_in_scope(db, issue_id, user)
    if issue.status == "Closed":
        raise HTTPException(409, f"{issue.code} is already closed")
    need_photo = settings_service.get_all(db)["integrity"]["require_after_photo"]
    if need_photo and not after_photo:
        raise HTTPException(400, "Attach an after photo to close this issue (Settings → Audit integrity)")
    if after_photo:
        issue.after_photo = save_photo(after_photo)
    issue.status, issue.closed_at, issue.closed_by_id = "Closed", datetime.now(), user.id
    issue.closure_note, issue.escalation_level = note or None, 0
    db.commit()
    db.refresh(issue)
    bg.add_task(hub.publish, "issue.closed", {"code": issue.code, "zone": issue.zone.name, "by": user.name})
    return issue_out(issue)


@router.post("/{issue_id}/reopen")
def reopen_issue(issue_id: int, bg: BackgroundTasks, user: User = Depends(staff), db: Session = Depends(get_db)):
    issue = _issue_in_scope(db, issue_id, user)
    issue.status, issue.closed_at, issue.closed_by_id = "Open", None, None
    db.commit()
    db.refresh(issue)
    bg.add_task(hub.publish, "issue.reopened", {"code": issue.code, "zone": issue.zone.name, "by": user.name})
    return issue_out(issue)


@router.delete("/{issue_id}")
def delete_issue(issue_id: int, bg: BackgroundTasks, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Super Admin only. Removes the issue, the audit finding it came from, and their photos."""
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found. It may already have been deleted.")
    code, zone = issue.code, issue.zone.name
    for url in delete_issue_and_findings(db, issue):
        bg.add_task(delete_photo, url)
    bg.add_task(hub.publish, "issue.deleted", {"code": code, "zone": zone, "by": user.name})
    bg.add_task(hub.publish, "audit.changed", {"zone": zone, "action": "finding deleted"})
    return {"ok": True, "code": code}
