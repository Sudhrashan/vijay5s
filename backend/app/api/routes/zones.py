from collections import Counter

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import admin_only, anyone
from app.db.session import get_db
from app.models import Audit, Issue, Zone
from app.realtime.hub import hub
from app.schemas.inputs import ZoneIn
from app.services.serializers import days_open, zone_out
from app.services.stats import current_cycle, zone_scores

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("", dependencies=[Depends(anyone)])
def list_zones(db: Session = Depends(get_db)):
    issues = db.query(Issue).all()
    scores = zone_scores(db.query(Audit).all(), current_cycle())
    op = Counter(i.zone_id for i in issues if i.status == "Open")
    cl = Counter(i.zone_id for i in issues if i.status == "Closed")
    closed_days: dict[int, list[int]] = {}
    for i in issues:
        if i.status == "Closed":
            closed_days.setdefault(i.zone_id, []).append(days_open(i))
    out = []
    for z in db.query(Zone).order_by(Zone.name):
        d = closed_days.get(z.id, [])
        out.append(zone_out(z, op.get(z.id, 0), cl.get(z.id, 0), scores.get(z.id),
                            round(sum(d) / len(d), 1) if d else None))
    return out


@router.post("", status_code=201, dependencies=[Depends(admin_only)])
def create_zone(body: ZoneIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    if db.query(Zone).filter(Zone.name == body.name.strip()).first():
        raise HTTPException(409, f"A zone called {body.name} already exists")
    z = Zone(name=body.name.strip(), checkpoints=body.checkpoints, incharge_id=body.incharge_id)
    db.add(z)
    db.commit()
    db.refresh(z)
    bg.add_task(hub.publish, "zone.changed", {"name": z.name})
    return zone_out(z)


@router.patch("/{zone_id}", dependencies=[Depends(admin_only)])
def update_zone(zone_id: int, body: ZoneIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    z = db.get(Zone, zone_id)
    if not z:
        raise HTTPException(404, "Zone not found")
    z.name, z.checkpoints, z.incharge_id = body.name.strip(), body.checkpoints, body.incharge_id
    db.commit()
    db.refresh(z)
    bg.add_task(hub.publish, "zone.changed", {"name": z.name})
    return zone_out(z)
