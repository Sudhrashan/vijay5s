from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import admin_only, anyone
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User
from app.realtime.hub import hub
from app.schemas.inputs import UserIn, UserPatch
from app.services.serializers import user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(user: User = Depends(anyone), db: Session = Depends(get_db)):
    rows = [user_out(u) for u in db.query(User).order_by(User.name)]
    if user.role != "Super Admin":
        for r in rows:
            r["email"] = None  # only the admin manages contact details
    return rows


@router.post("", status_code=201, dependencies=[Depends(admin_only)])
def create_user(body: UserIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    emp = body.emp_id.strip().upper()
    if db.query(User).filter(User.emp_id == emp).first():
        raise HTTPException(409, f"Employee ID {emp} is already registered")
    u = User(emp_id=emp, name=body.name.strip(), role=body.role, email=body.email, zone_id=body.zone_id,
             password_hash=hash_password(body.password or settings.DEFAULT_USER_PASSWORD))
    db.add(u)
    db.commit()
    db.refresh(u)
    bg.add_task(hub.publish, "user.changed", {"name": u.name})
    return user_out(u)


@router.patch("/{user_id}", dependencies=[Depends(admin_only)])
def update_user(user_id: int, body: UserPatch, bg: BackgroundTasks, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)
    demoting = u.role == "Super Admin" and u.active and (
        data.get("active") is False or data.get("role", "Super Admin") != "Super Admin")
    if demoting and db.query(User).filter(User.role == "Super Admin", User.active.is_(True)).count() == 1:
        raise HTTPException(400, "Keep at least one active Super Admin. Make someone else Super Admin first.")
    if pw := data.pop("password", None):
        u.password_hash = hash_password(pw)
    for k, v in data.items():
        setattr(u, k, v)
    db.commit()
    db.refresh(u)
    bg.add_task(hub.publish, "user.changed", {"name": u.name})
    return user_out(u)


@router.delete("/{user_id}", dependencies=[Depends(admin_only)])
def deactivate_user(user_id: int, bg: BackgroundTasks, db: Session = Depends(get_db)):
    """Users are deactivated, never deleted, so their audit history stays intact."""
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.role == "Super Admin" and db.query(User).filter(User.role == "Super Admin", User.active.is_(True)).count() == 1:
        raise HTTPException(400, "Keep at least one active Super Admin")
    u.active = False
    db.commit()
    bg.add_task(hub.publish, "user.changed", {"name": u.name})
    return user_out(u)
