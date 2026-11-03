from functools import lru_cache
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRETS = {"change-me", "change-me-to-a-long-random-string"}
DEFAULT_ADMIN_PASSWORD = "admin123"


class Settings(BaseSettings):
    """All runtime configuration comes from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Vijay 5S Console API"
    ENV: str = "development"
    PLANT_CODE: str = "VD01"

    DATABASE_URL: str = "postgresql+psycopg://vijay:vijay@localhost:5432/vijay5s"
    REDIS_URL: str | None = None  # set in production so every API replica shares live events

    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_MINUTES: int = 60 * 12

    CORS_ORIGINS: str = "http://localhost:5173"
    UPLOAD_DIR: str = "/data/uploads"
    # Photo storage: unset SUPABASE_URL to keep saving photos to UPLOAD_DIR (local dev / offline).
    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_KEY: str | None = None
    SUPABASE_BUCKET: str = "5sphotos"

    SEED_ON_START: bool = True
    # True: an empty database gets the full demo dataset (fake users, zones, 6 months of audits
    # and issues). False: only the Super Admin account is created -- use this for a real pilot.
    SEED_DEMO_DATA: bool = True
    ADMIN_EMP_ID: str = "EMP1001"
    ADMIN_PASSWORD: str = DEFAULT_ADMIN_PASSWORD
    DEFAULT_USER_PASSWORD: str = "vijay123"

    ESCALATION_CHECK_MINUTES: int = 30

    @field_validator("SUPABASE_URL", "SUPABASE_SERVICE_KEY", mode="before")
    @classmethod
    def _blank_is_none(cls, v):
        # Values pasted into a host dashboard often carry a trailing space/newline or slash.
        if isinstance(v, str):
            v = v.strip().rstrip("/")
            return v or None
        return v

    @field_validator("ADMIN_EMP_ID")
    @classmethod
    def _emp_id_upper(cls, v: str) -> str:
        """Login uppercases the Employee ID before lookup, so the seeded admin must match."""
        return v.strip().upper()

    @field_validator("DATABASE_URL")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        """Hosts like Railway hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the
        psycopg (v3) driver named explicitly."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @model_validator(mode="after")
    def _safe_for_production(self):
        if self.ENV.strip().lower() != "production":
            return self
        problems = []
        if self.JWT_SECRET in DEFAULT_JWT_SECRETS or len(self.JWT_SECRET) < 32:
            problems.append(
                "JWT_SECRET is the default or shorter than 32 characters. Set it to a long random "
                "value, e.g. the output of: python -c \"import secrets; print(secrets.token_urlsafe(48))\"")
        if self.ADMIN_PASSWORD == DEFAULT_ADMIN_PASSWORD:
            problems.append(
                "ADMIN_PASSWORD is still the default 'admin123'. Set it to a strong password "
                "before the first start.")
        if problems:
            raise ValueError("Refusing to start with ENV=production: " + " | ".join(problems))
        return self

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
