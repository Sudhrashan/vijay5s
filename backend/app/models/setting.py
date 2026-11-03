from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

DEFAULT_SETTINGS = {
    "escalation_days": [7, 15, 30],
    "closure_target_days": 7,
    "min_score": 75,
    "audits_per_zone_per_month": 2,
    "notifications": {
        "audit_assigned": True,
        "issue_raised": True,
        "issue_closed": True,
        "issue_overdue": True,
        "weekly_summary": False,
    },
    "integrity": {
        "require_qr": True,
        "gps_stamp": True,
        "require_after_photo": True,
        "allow_gallery": False,
    },
}


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict | list | int | bool | str] = mapped_column(JSON)
