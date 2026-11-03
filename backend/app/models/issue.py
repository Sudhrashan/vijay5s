from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

CATEGORIES = {
    "1S": "1S Sort",
    "2S": "2S Set in Order",
    "3S": "3S Shine",
    "4S": "4S Standardize",
    "5S": "5S Sustain",
}
PRIORITIES = ("Critical", "Major", "Minor")


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # VD-1001
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), index=True)
    audit_id: Mapped[int | None] = mapped_column(ForeignKey("audits.id", ondelete="SET NULL"))
    category: Mapped[str] = mapped_column(String(2), index=True)
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(10), default="Minor")
    status: Mapped[str] = mapped_column(String(10), default="Open", index=True)

    raised_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    raised_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    closed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    before_photo: Mapped[str | None] = mapped_column(String(255))
    after_photo: Mapped[str | None] = mapped_column(String(255))
    closure_note: Mapped[str | None] = mapped_column(Text)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)  # 0 none, 1 area head, 2 plant head, 3 FM

    zone = relationship("Zone", lazy="joined")
    raised_by = relationship("User", foreign_keys=[raised_by_id], lazy="joined")
    closed_by = relationship("User", foreign_keys=[closed_by_id], lazy="joined")
