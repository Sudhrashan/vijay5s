"""Shared pytest fixtures for the Vijay 5S Console backend test suite.

Design notes
------------
- `app.core.config.settings` is built once, at import time, from environment variables
  (see app/core/config.py). So env vars that control the DB/seeding behaviour MUST be set
  BEFORE anything imports `app.main` (which imports `app.core.config`). We do this at the
  very top of this file, before any `app.*` import. Because backend/.env may contain real
  secrets (e.g. a Supabase service key), every sensitive variable is FORCED (not setdefault):
  real process env vars take priority over the .env file. Supabase is always off in tests and
  an autouse fixture blocks urllib.request.urlopen.
- Each test function gets its own throwaway SQLite file. We point DATABASE_URL at a fresh
  temp file per test and call `app.main.run_migrations()` (the project's own Alembic
  migration entrypoint, the single source of truth for schema per CLAUDE.md) rather than
  `Base.metadata.create_all`, because one of the Alembic migrations
  (5b74110c8aef_seed_5s_checkpoints) seeds the 34 fixed 5S checklist questions that
  `app/api/routes/audits.py` depends on (CHECKLIST_MAX = 68 = 34 x 2). create_all would
  skip that data seed and break any audit-scoring test.
- SEED_ON_START is forced to "false" so FastAPI's lifespan does not run app.db.seed.seed()
  (which would collide with/duplicate whatever a test sets up). Tests that want a realistic
  dataset call `app.db.seed.seed()` explicitly via the `seeded_db` fixture.
- We bypass the FastAPI `lifespan` entirely (no `with TestClient(app) as client`) because
  lifespan re-runs migrations/seeding/hub-startup/the escalation background loop, none of
  which a synchronous test needs, and the escalation loop would keep a stray asyncio task
  running across tests. We run migrations ourselves and never enter the lifespan context.
"""
import atexit
import os
import shutil
import tempfile
import uuid

# backend/.env may hold REAL deployment values (Supabase service key, production DB URL,
# ENV=production). Process env vars always beat the .env file in pydantic-settings, so force
# every value that could reach a real service or change behaviour, before any `app.*` import.
os.environ["ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite://"  # placeholder; app_env points each test at its own file
os.environ["SUPABASE_URL"] = ""  # blank -> None in config: photos go to local UPLOAD_DIR
os.environ["SUPABASE_SERVICE_KEY"] = ""
os.environ["SUPABASE_BUCKET"] = "test-bucket"
os.environ["REDIS_URL"] = ""
os.environ["SEED_ON_START"] = "false"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ADMIN_EMP_ID"] = "EMP1001"
os.environ["ADMIN_PASSWORD"] = "admin123"
os.environ["DEFAULT_USER_PASSWORD"] = "vijay123"
# app.main creates/mounts UPLOAD_DIR at import; keep that out of backend/ (per-test dirs below).
_SESSION_UPLOADS = tempfile.mkdtemp(prefix="vijay5s-test-uploads-")
os.environ["UPLOAD_DIR"] = _SESSION_UPLOADS
atexit.register(shutil.rmtree, _SESSION_UPLOADS, ignore_errors=True)

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _no_real_network(monkeypatch):
    """Safety net: no test may open a real HTTP connection (e.g. to Supabase Storage).
    Tests that exercise the upload path patch urlopen themselves."""
    import urllib.request

    def _blocked(*a, **k):
        raise AssertionError("Tests must not make real network calls; mock urllib.request.urlopen")
    monkeypatch.setattr(urllib.request, "urlopen", _blocked)


def _fresh_sqlite_url(tmp_path_factory) -> str:
    db_file = tmp_path_factory.mktemp("db") / f"test_{uuid.uuid4().hex}.sqlite3"
    return f"sqlite:///{db_file}"


@pytest.fixture()
def app_env(tmp_path_factory, monkeypatch):
    """Points DATABASE_URL at a brand-new sqlite file and runs Alembic migrations against it.

    Must run before `app.main`/`app.core.config` are imported for the first time in a
    process, OR we must bust the cached settings/engine. We handle this by clearing the
    lru_cache on get_settings and rebuilding the engine/sessionmaker used by the app, so
    this fixture works no matter what import order pytest collection used.
    """
    url = _fresh_sqlite_url(tmp_path_factory)
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path_factory.mktemp("uploads")))
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "")

    from app.core.config import get_settings
    get_settings.cache_clear()
    import app.core.config as config_mod
    config_mod.settings = get_settings()

    # Rebuild the SQLAlchemy engine/sessionmaker bound to the new DATABASE_URL, and repoint
    # every module-level alias of SessionLocal that was captured at import time.
    import importlib
    import app.db.session as session_mod
    importlib.reload(session_mod)

    import app.main as main_mod
    main_mod.settings = config_mod.settings
    main_mod.SessionLocal = session_mod.SessionLocal

    import app.api.deps as deps_mod
    deps_mod.get_db = session_mod.get_db

    # Modules that captured `settings` at import must see this test's settings too
    # (per-test UPLOAD_DIR, Supabase always off).
    import app.services.storage as storage_mod
    import app.db.seed as seed_mod
    storage_mod.settings = config_mod.settings
    seed_mod.settings = config_mod.settings
    assert config_mod.settings.SUPABASE_URL is None and config_mod.settings.SUPABASE_SERVICE_KEY is None

    main_mod.run_migrations()
    return session_mod


@pytest.fixture()
def db_session(app_env):
    """A raw SQLAlchemy session against the fresh per-test database."""
    db = app_env.SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(app_env, monkeypatch):
    """A TestClient wired to the per-test database, bypassing FastAPI lifespan startup."""
    import app.main as main_mod

    # Avoid overriding get_db app-wide via dependency_overrides (routes imported get_db by
    # reference already bound at decoration time via Depends(get_db); since get_db closes
    # over the (reloaded) SessionLocal module global, rebinding app.db.session.SessionLocal
    # above is sufficient for new sessions to use the fresh engine).
    return TestClient(main_mod.app)


@pytest.fixture()
def seeded_db(app_env, db_session):
    """Loads the full realistic starter dataset via the project's own seed script."""
    from app.db.seed import seed
    seed(db_session)
    db_session.commit()
    return db_session


def _login(client: TestClient, emp_id: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"emp_id": emp_id, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers(client, seeded_db):
    from app.core.config import settings
    return _login(client, settings.ADMIN_EMP_ID, settings.ADMIN_PASSWORD)


@pytest.fixture()
def incharge_headers(client, seeded_db):
    """Suresh Babu, EMP1123, 5S Incharge for Warehouse (see app/db/seed.py USERS)."""
    from app.core.config import settings
    return _login(client, "EMP1123", settings.DEFAULT_USER_PASSWORD)


@pytest.fixture()
def auditor_headers(client, seeded_db):
    """Ravi Kumar, EMP1021, Auditor for Warehouse (see app/db/seed.py USERS)."""
    from app.core.config import settings
    return _login(client, "EMP1021", settings.DEFAULT_USER_PASSWORD)
