from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Matches the 5 sections on the plant's printed 5S checklist (ROE004).
CHECKPOINT_CATEGORIES = ("1S", "2S", "3S", "4S", "5S")


class Checkpoint(Base):
    """One fixed question on the 5S checklist (ROE004). Same 34 questions every audit."""

    __tablename__ = "checkpoints"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(2), index=True)
    order: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
