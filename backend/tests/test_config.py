"""Startup configuration: production safety checks, DATABASE_URL normalisation, pilot seeding."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings

STRONG_SECRET = "x" * 48


def _settings(**kw) -> Settings:
    return Settings(_env_file=None, **kw)  # never read backend/.env here


@pytest.mark.parametrize("secret", ["change-me", "change-me-to-a-long-random-string", "short-but-custom"])
def test_production_refuses_weak_jwt_secret(secret):
    with pytest.raises(ValidationError) as exc:
        _settings(ENV="production", JWT_SECRET=secret, ADMIN_PASSWORD="Str0ng-pilot-pass")
    msg = str(exc.value)
    assert "JWT_SECRET" in msg and "secrets.token_urlsafe(48)" in msg
    assert "ADMIN_PASSWORD" not in msg


def test_production_refuses_default_admin_password():
    with pytest.raises(ValidationError) as exc:
        _settings(ENV="production", JWT_SECRET=STRONG_SECRET, ADMIN_PASSWORD="admin123")
    msg = str(exc.value)
    assert "ADMIN_PASSWORD" in msg and "JWT_SECRET" not in msg


def test_production_starts_with_safe_values():
    s = _settings(ENV="production", JWT_SECRET=STRONG_SECRET, ADMIN_PASSWORD="Str0ng-pilot-pass")
    assert s.ENV == "production"


def test_development_stays_permissive():
    s = _settings(ENV="development", JWT_SECRET="change-me", ADMIN_PASSWORD="admin123")
    assert s.JWT_SECRET == "change-me"


@pytest.mark.parametrize("given, expected", [
    ("postgres://u:p@host:5432/db", "postgresql+psycopg://u:p@host:5432/db"),
    ("postgresql://u:p@host:5432/db", "postgresql+psycopg://u:p@host:5432/db"),
    ("postgresql+psycopg://u:p@host:5432/db", "postgresql+psycopg://u:p@host:5432/db"),
    ("sqlite:///./dev.sqlite3", "sqlite:///./dev.sqlite3"),
    ("sqlite://", "sqlite://"),
])
def test_database_url_scheme_normalised(given, expected):
    assert _settings(DATABASE_URL=given).DATABASE_URL == expected


def test_blank_supabase_values_mean_disabled():
    s = _settings(SUPABASE_URL="", SUPABASE_SERVICE_KEY="  ")
    assert s.SUPABASE_URL is None and s.SUPABASE_SERVICE_KEY is None


def test_seed_without_demo_data_creates_only_super_admin(db_session):
    from app.core.config import settings
    from app.db.seed import seed
    from app.models import Audit, Issue, User, Zone

    assert seed(db_session, demo=False) is True
    users = db_session.query(User).all()
    assert len(users) == 1
    assert users[0].role == "Super Admin" and users[0].emp_id == settings.ADMIN_EMP_ID
    assert db_session.query(Zone).count() == 0
    assert db_session.query(Issue).count() == 0
    assert db_session.query(Audit).count() == 0
    assert seed(db_session, demo=False) is False  # idempotent on a non-empty DB


def test_seed_demo_flag_false_is_read_from_settings(db_session, monkeypatch):
    import app.db.seed as seed_mod
    from app.models import User, Zone
    monkeypatch.setattr(seed_mod, "settings", seed_mod.settings.model_copy(update={"SEED_DEMO_DATA": False}))
    assert seed_mod.seed(db_session) is True
    assert db_session.query(User).count() == 1 and db_session.query(Zone).count() == 0


def test_admin_emp_id_is_uppercased():
    assert _settings(ADMIN_EMP_ID="  5sadmin ").ADMIN_EMP_ID == "5SADMIN"


def test_lowercase_admin_emp_id_can_log_in(client, db_session, monkeypatch):
    import app.db.seed as seed_mod
    pilot = _settings(ADMIN_EMP_ID="5sadmin", ADMIN_PASSWORD="made-up-test-pass", SEED_DEMO_DATA=False)
    monkeypatch.setattr(seed_mod, "settings", pilot)
    assert seed_mod.seed(db_session) is True
    for emp_id in ("5sadmin", "5SADMIN"):
        resp = client.post("/api/auth/login", json={"emp_id": emp_id, "password": "made-up-test-pass"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["user"]["role"] == "Super Admin"


def test_super_admin_from_pilot_seed_can_log_in(client, db_session):
    from app.core.config import settings
    from app.db.seed import seed
    seed(db_session, demo=False)
    resp = client.post("/api/auth/login", json={"emp_id": settings.ADMIN_EMP_ID, "password": settings.ADMIN_PASSWORD})
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["role"] == "Super Admin"
