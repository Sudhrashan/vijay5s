"""Creates tables and, on an empty database, loads Plant VD01 starter data.

Zones, people and finding texts come from the 5S console prototype. Audits and issues are
generated for the last six months relative to today so every chart has data on day one.
Run manually with:  python -m app.db.seed
"""
import random
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Audit, Issue, User, Zone
from app.services.stats import current_cycle, shift

ZONES = [  # name, checkpoints, incharge emp_id, relative issue weight, base score
    ("Production", 24, "EMP1123", 47, 74), ("Packing", 20, "EMP1134", 31, 79),
    ("Warehouse", 20, "EMP1123", 37, 76), ("Dispatch", 16, "EMP1161", 21, 83),
    ("Utility", 14, "EMP1194", 15, 88), ("Maintenance", 18, "EMP1183", 13, 86),
    ("Quality", 22, "EMP1172", 9, 94), ("Stores", 20, "EMP1044", 13, 92),
    ("Lab", 16, "EMP1172", 5, 96), ("Office", 12, "EMP1205", 3, 91), ("Security", 10, "EMP1216", 2, 95),
]

USERS = [
    ("Ravi Kumar", "EMP1021", "Auditor", "Warehouse"), ("Kumar Selvan", "EMP1044", "Auditor", "Warehouse"),
    ("Manoj Pillai", "EMP1090", "Auditor", "Production"), ("Arjun Nair", "EMP1112", "Auditor", "Production"),
    ("Suresh Babu", "EMP1123", "5S Incharge", "Warehouse"), ("Anil Joseph", "EMP1134", "5S Incharge", "Packing"),
    ("Priya Menon", "EMP1150", "Auditor", "Quality"), ("Ramesh Iyer", "EMP1161", "5S Incharge", "Dispatch"),
    ("Deepa Rani", "EMP1172", "5S Incharge", "Quality"), ("Ganesh Rao", "EMP1183", "5S Incharge", "Maintenance"),
    ("Prakash Shetty", "EMP1194", "5S Incharge", "Utility"), ("Latha Devi", "EMP1205", "5S Incharge", "Office"),
    ("Vikram Singh", "EMP1216", "5S Incharge", "Security"), ("Sanjay Gupta", "EMP1227", "Auditor", "Stores"),
    ("Meena Kumari", "EMP1238", "Auditor", "Packing"), ("Rahul Das", "EMP1249", "Auditor", "Dispatch"),
    ("Ajay Verma", "EMP1260", "Auditor", "Utility"), ("Nisha Thomas", "EMP1271", "Auditor", "Lab"),
    ("Karthik R", "EMP1282", "Auditor", "Maintenance"), ("Sunita Bai", "EMP1293", "Auditor", "Office"),
    ("Mohan Lal", "EMP1304", "Auditor", "Security"), ("Admin", "EMP1001", "Super Admin", None),
]

FINDINGS = {
    "1S": ["Unused pallets stacked in aisle", "Obsolete crates near line 2", "Scrap not segregated at source",
           "Damaged drums kept in bay", "Expired chemical containers stored"],
    "2S": ["Floor marking faded near dock", "Tools not returned to shadow board", "Crates blocking fire exit",
           "Trolley parked outside marked area", "Hose not on designated hook"],
    "3S": ["Oil leakage near Machine 5", "Milk spillage under filler", "Dust on panel top",
           "Condensate pooling near chiller", "Drain cover soiled at CIP bay"],
    "4S": ["SOP display board outdated", "Cleaning checklist not signed", "Label format not standard",
           "Zone board missing owner name", "Colour coding not followed"],
    "5S": ["Previous audit point repeated", "Daily 5S register not updated", "Team 5S training overdue",
           "Audit tag not closed in time", "Zone self-audit not conducted"],
}
CAT_WEIGHTS = [30, 22, 18, 13, 17]


def seed(db: Session, demo: bool | None = None) -> bool:
    """Loads starter data into an empty database. With SEED_DEMO_DATA=false (or demo=False)
    only the Super Admin account is created; real zones and users are added in the app."""
    if db.query(User).first():
        return False
    if demo is None:
        demo = settings.SEED_DEMO_DATA
    if not demo:
        emp = settings.ADMIN_EMP_ID
        db.add(User(emp_id=emp, name="Admin", role="Super Admin", zone_id=None,
                    email=f"{emp.lower()}@vijaydairy.example",
                    password_hash=hash_password(settings.ADMIN_PASSWORD)))
        db.commit()
        return True
    rnd = random.Random(20260826)
    today = date.today()
    now = datetime.now()

    zones = {}
    for name, cp, _, _, _ in ZONES:
        z = Zone(name=name, checkpoints=cp)
        db.add(z)
        zones[name] = z
    db.flush()

    users = {}
    for name, emp, role, zone in USERS:
        pw = settings.ADMIN_PASSWORD if emp == settings.ADMIN_EMP_ID else settings.DEFAULT_USER_PASSWORD
        u = User(emp_id=emp, name=name, role=role, zone_id=zones[zone].id if zone else None,
                 email=f"{emp.lower()}@vijaydairy.example", password_hash=hash_password(pw))
        db.add(u)
        users[emp] = u
    db.flush()
    for name, _, ic, _, _ in ZONES:
        zones[name].incharge_id = users[ic].id

    auditors = [u for u in users.values() if u.role == "Auditor"]
    home = {z: [u for u in auditors if u.zone_id == zones[z].id] for z in zones}

    cycles = [shift(current_cycle(), k) for k in range(-5, 1)]
    seq = 1000
    pending_issues = []
    for ci, cyc in enumerate(cycles):
        y, m = map(int, cyc.split("-"))
        for zi, (zname, _, _, weight, base) in enumerate(ZONES):
            for slot in (0, 1):
                day = min(28, 3 + (zi * 2) % 12 + slot * 14)
                planned = date(y, m, day)
                team = home[zname][:2] or [rnd.choice(auditors)]
                a = Audit(zone_id=zones[zname].id, cycle=cyc, planned_date=planned)
                a.auditors = team
                if planned < today:
                    hit = rnd.random() < 0.62 + ci * 0.05
                    if hit:
                        a.status, a.completed_at = "Completed", datetime.combine(planned, datetime.min.time()) + timedelta(hours=10)
                        a.score = max(55, min(99, base - (5 - ci) + rnd.randint(-3, 3)))
                        a.submitted_by = team[0]
                    else:
                        a.status, a.missed_reason = "Missed", None
                db.add(a)
                if a.status != "Completed":
                    continue
                n = max(0, round(rnd.gauss(weight / 9, 1.2)))
                for _ in range(n):
                    cat = rnd.choices(list(FINDINGS), CAT_WEIGHTS)[0]
                    raised = a.completed_at + timedelta(minutes=rnd.randint(5, 90))
                    pending_issues.append((raised, zname, cat, a, team))

    db.flush()
    pending_issues.sort(key=lambda t: t[0])
    for raised, zname, cat, a, team in pending_issues:
        seq += 1
        age = (now - raised).days
        closed = rnd.random() < min(0.93, 0.35 + age / 60)
        dur = 2 + int(rnd.random() ** 1.7 * 28)
        closed_at = raised + timedelta(days=dur, hours=rnd.randint(1, 8)) if closed else None
        if closed_at and closed_at > now:
            closed_at = None
        pr = "Critical" if rnd.random() < 0.14 else ("Major" if rnd.random() < 0.45 else "Minor")
        inc = zones[zname].incharge_id
        db.add(Issue(code=f"VD-{seq}", zone_id=zones[zname].id,
                     audit_id=a.id, category=cat, description=rnd.choice(FINDINGS[cat]), priority=pr,
                     status="Closed" if closed_at else "Open", raised_by_id=rnd.choice(team).id,
                     raised_at=raised, closed_at=closed_at, closed_by_id=inc if closed_at else None))
    db.commit()
    return True


def main() -> None:
    """Run `alembic upgrade head` first; this only loads starter data."""
    with SessionLocal() as db:
        loaded = seed(db)
        if loaded:
            from app.services import escalation
            escalation.run(db)
    print("Seed data loaded" if loaded else "Database already has data; seed skipped")


if __name__ == "__main__":
    main()
