from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# Matches the 5 sections on the plant's printed 5S checklist (ROE004).
FINDING_CATEGORIES = ("1S", "2S", "3S", "4S", "5S")


class Finding(Base):
    """One photo+category+remark the auditor logs during an audit."""

    __tablename__ = "audit_responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(2), index=True)
    remark: Mapped[str] = mapped_column(Text)
    photo_url: Mapped[str] = mapped_column(String(300))
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # Every finding opens an Issue (before photo = this photo) so the zone's 5S Incharge can
    # close it with an after photo through the normal issue close flow.
    issue_id: Mapped[int | None] = mapped_column(ForeignKey("issues.id", ondelete="SET NULL"), index=True)

    issue = relationship("Issue", lazy="joined")
