from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

audit_auditors = Table(
    "audit_auditors",
    Base.metadata,
    Column("audit_id", ForeignKey("audits.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

# Stored status values. "Due today" and "Unassigned" are derived when read.
AUDIT_STATUSES = ("Scheduled", "Completed", "Missed")


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id", ondelete="CASCADE"), index=True)
    cycle: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    planned_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(12), default="Scheduled")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    missed_reason: Mapped[str | None] = mapped_column(Text)
    # Who marked it Completed -- with two auditors on a zone, shows the partner it is already done.
    submitted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    zone = relationship("Zone", lazy="joined")
    submitted_by = relationship("User", foreign_keys=[submitted_by_id], lazy="joined")
    auditors = relationship("User", secondary=audit_auditors, lazy="selectin")

    def display_status(self, today: date) -> str:
        if self.status in ("Completed", "Missed"):
            return self.status
        if not self.auditors:
            return "Unassigned"
        if self.planned_date == today:
            return "Due today"
        return "Scheduled"
