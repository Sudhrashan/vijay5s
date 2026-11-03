from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)


def user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = decode_token(token)
    except Exception:
        return None
    user = db.get(User, int(payload["sub"]))
    return user if user and user.active else None


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    user = user_from_token(cred.credentials, db) if cred else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in again: your session has expired")
    return user


def require(*roles: str):
    def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only {', '.join(roles)} can do this")
        return user
    return checker


admin_only = require("Super Admin")
staff = require("Super Admin", "5S Incharge")
anyone = current_user
