"""Re-evaluates the escalation level of every open issue against the settings matrix."""
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Issue
from app.services import settings_service
from app.services.serializers import days_open

LEVEL_NAMES = {1: "Area Head", 2: "Plant Head", 3: "Factory Manager"}


def run(db: Session) -> list[dict]:
    limits = settings_service.get_all(db)["escalation_days"]
    now = datetime.now()
    changed = []
    for i in db.query(Issue).filter(Issue.status == "Open").all():
        d = days_open(i, now)
        level = sum(1 for lim in limits if d > lim)
        if level != i.escalation_level:
            if level > i.escalation_level:
                changed.append({"code": i.code, "zone": i.zone.name, "days": d,
                                "level": level, "to": LEVEL_NAMES[level]})
            i.escalation_level = level
    db.commit()
    # Hook point: send email / WhatsApp to `to` for each changed row here.
    return changed
