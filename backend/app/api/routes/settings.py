from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import admin_only, anyone
from app.db.session import get_db
from app.realtime.hub import hub
from app.services import escalation, settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", dependencies=[Depends(anyone)])
def get_settings(db: Session = Depends(get_db)):
    return settings_service.get_all(db)


@router.put("", dependencies=[Depends(admin_only)])
def put_settings(patch: dict, bg: BackgroundTasks, db: Session = Depends(get_db)):
    if "escalation_days" in patch:
        days = patch["escalation_days"]
        ok = (isinstance(days, list) and len(days) == 3
              and all(isinstance(d, int) and not isinstance(d, bool) and d > 0 for d in days)
              and days[0] < days[1] < days[2])
        if not ok:
            raise HTTPException(400, "Escalation limits must be three whole numbers of days, each larger than the last (e.g. 7, 15, 30)")
    out = settings_service.update(db, patch)
    if "escalation_days" in patch:
        escalation.run(db)  # changing a limit re-evaluates every open issue right away
    bg.add_task(hub.publish, "settings.changed", {})
    return out
