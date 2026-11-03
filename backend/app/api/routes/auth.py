from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.security import create_token, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.inputs import LoginIn
from app.services.serializers import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.emp_id == body.emp_id.strip().upper()).first()
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Employee ID or password is incorrect")
    return {"token": create_token(user.id, user.role), "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
