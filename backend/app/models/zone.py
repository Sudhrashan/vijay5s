import secrets

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    checkpoints: Mapped[int] = mapped_column(Integer, default=10)
    incharge_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL", use_alter=True))
    # Printed on the zone board; the auditor app sends it to prove presence on the floor.
    qr_token: Mapped[str] = mapped_column(String(32), default=lambda: secrets.token_hex(8), unique=True)

    incharge = relationship("User", foreign_keys=[incharge_id], lazy="joined")
