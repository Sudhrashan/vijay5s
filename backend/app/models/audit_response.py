from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# Score criteria printed on the checklist: 0 Initial Situation, 0.5 First Improvements,
# 1 Development, 1.5 Integrated System, 2 Excellence.
SCORE_CHOICES = (0, 0.5, 1, 1.5, 2)


class AuditResponse(Base):
    """One auditor's answer to one checkpoint, for one audit."""

    __tablename__ = "audit_responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    checkpoint_id: Mapped[int] = mapped_column(ForeignKey("checkpoints.id", ondelete="RESTRICT"), index=True)
    score: Mapped[float] = mapped_column(Numeric(2, 1))
    photo_url: Mapped[str | None] = mapped_column(String(300))
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    checkpoint = relationship("Checkpoint", lazy="joined")
