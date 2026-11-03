from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

ROLES = ("Super Admin", "5S Incharge", "Auditor")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    emp_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), index=True)
    email: Mapped[str | None] = mapped_column(String(160))
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    password_hash: Mapped[str] = mapped_column(String(100))
    # Users are deactivated, never deleted, so audit history stays intact.
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    zone = relationship("Zone", foreign_keys=[zone_id], lazy="joined")
