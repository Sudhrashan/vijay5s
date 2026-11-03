import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig

from app.api.routes import audits, auth, dashboard, issues, meta, reports, settings as settings_routes, users, ws, zones
from app.core.config import settings
from app.db.seed import seed
from app.db.session import SessionLocal
from app.realtime.hub import hub
from app.services import escalation

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_migrations() -> None:
    """Brings the database schema to the latest Alembic revision. The single source of
    truth for the schema in every environment — dev, CI, and production alike."""
    cfg = AlembicConfig(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    alembic_command.upgrade(cfg, "head")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


async def escalation_loop() -> None:
    """Re-checks open issues against the escalation matrix and pushes changes live."""
    while True:
        try:
            def job():
                with SessionLocal() as db:
                    return escalation.run(db)
            changed = await asyncio.to_thread(job)
            if changed:
                await hub.publish("issue.escalated", {"count": len(changed), "items": changed[:10]})
        except Exception:
            log.exception("Escalation run failed")
        await asyncio.sleep(settings.ESCALATION_CHECK_MINUTES * 60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    run_migrations()
    if settings.SEED_ON_START:
        with SessionLocal() as db:
            if seed(db):
                log.info("Loaded Plant %s starter data", settings.PLANT_CODE)
    await hub.start()
    task = asyncio.create_task(escalation_loop())
    yield
    task.cancel()
    await hub.stop()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth, meta, dashboard, issues, users, zones, audits, reports, settings_routes):
    app.include_router(r.router, prefix="/api")
app.include_router(ws.router)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health():
    return {"ok": True, "plant": settings.PLANT_CODE, "online": hub.online}
