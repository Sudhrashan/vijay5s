from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import anyone
from app.db.session import get_db
from app.models import CATEGORIES, Issue, User, Zone
from app.realtime.hub import hub
from app.services.stats import available_cycles, current_cycle

router = APIRouter(tags=["meta"])


@router.get("/meta", dependencies=[Depends(anyone)])
def meta(db: Session = Depends(get_db)):
    """Lookup lists the whole UI needs: months, zones, auditors, categories, badge counts."""
    return {
        "cycles": available_cycles(db),
        "current_cycle": current_cycle(),
        "zones": [{"id": z.id, "name": z.name} for z in db.query(Zone).order_by(Zone.name)],
        "auditors": [{"id": u.id, "name": u.name, "zone": u.zone.name if u.zone else None}
                     for u in db.query(User).filter(User.role == "Auditor", User.active.is_(True)).order_by(User.name)],
        "categories": [{"key": k, "label": v} for k, v in CATEGORIES.items()],
        "open_issues": db.query(Issue).filter(Issue.status == "Open").count(),
        "escalated": db.query(Issue).filter(Issue.status == "Open", Issue.escalation_level >= 2).count(),
        "online": hub.online,
    }
