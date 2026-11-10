import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Audit, Finding, Issue


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


def delete_issue_and_findings(db: Session, issue: Issue | None, finding: Finding | None = None) -> list[str]:
    """Delete an issue together with the audit finding(s) linked to it (or a lone finding).
    Commits. Returns the photo URLs that are no longer referenced, for the caller to remove."""
    findings = []
    if issue is not None:
        findings = db.query(Finding).filter(Finding.issue_id == issue.id).all()
    if finding is not None and finding not in findings:
        findings.append(finding)
    urls = [f.photo_url for f in findings]
    if issue is not None:
        urls += [issue.before_photo, issue.after_photo]
    for f in findings:
        db.delete(f)
    if issue is not None:
        db.delete(issue)
    db.commit()
    return [u for u in dict.fromkeys(urls) if u]
