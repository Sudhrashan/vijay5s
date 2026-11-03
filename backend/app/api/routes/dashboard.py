from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import anyone
from app.db.session import get_db
from app.services import stats

router = APIRouter(tags=["dashboard"], dependencies=[Depends(anyone)])


@router.get("/dashboard")
def dashboard(cycle: str | None = None, db: Session = Depends(get_db)):
    return stats.dashboard(db, cycle or stats.current_cycle())
