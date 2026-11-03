import copy

from sqlalchemy.orm import Session

from app.models import DEFAULT_SETTINGS, Setting


def get_all(db: Session) -> dict:
    out = copy.deepcopy(DEFAULT_SETTINGS)
    for row in db.query(Setting).all():
        if isinstance(out.get(row.key), dict) and isinstance(row.value, dict):
            out[row.key].update(row.value)
        else:
            out[row.key] = row.value
    return out


def update(db: Session, patch: dict) -> dict:
    for key, value in patch.items():
        if key not in DEFAULT_SETTINGS:
            continue
        row = db.get(Setting, key)
        if row:
            row.value = value
        else:
            db.add(Setting(key=key, value=value))
    db.commit()
    return get_all(db)
