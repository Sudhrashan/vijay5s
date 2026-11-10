import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Audit, Issue


def open_issue_for_finding(db: Session, audit: Audit, category: str, remark: str,
                           photo_url: str, raised_by_id: int) -> Issue:
    """Open an Issue for an auditor's finding: the finding photo is the before photo, so the
    zone's 5S Incharge closes it by taking an after photo. Flushes but does not commit."""
    issue = Issue(code=f"TMP-{uuid.uuid4().hex[:12]}", zone_id=audit.zone_id,
                  audit_id=audit.id, category=category, description=remark, priority="Minor",
                  status="Open", raised_by_id=raised_by_id, raised_at=datetime.now(),
                  before_photo=photo_url)
    db.add(issue)
    db.flush()
    issue.code = f"VD-{1000 + issue.id}"
    return issue
