from datetime import date

from pydantic import BaseModel, Field, field_validator


class LoginIn(BaseModel):
    emp_id: str
    password: str


class UserIn(BaseModel):
    emp_id: str = Field(min_length=3, max_length=20)
    name: str = Field(min_length=2, max_length=120)
    role: str
    email: str | None = None
    zone_id: int | None = None
    password: str | None = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("Super Admin", "5S Incharge", "Auditor"):
            raise ValueError("role must be Super Admin, 5S Incharge or Auditor")
        return v


class UserPatch(BaseModel):
    name: str | None = None
    role: str | None = None
    email: str | None = None
    zone_id: int | None = None
    active: bool | None = None
    password: str | None = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ("Super Admin", "5S Incharge", "Auditor"):
            raise ValueError("role must be Super Admin, 5S Incharge or Auditor")
        return v


class ZoneIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    checkpoints: int = Field(ge=1, le=200)
    incharge_id: int | None = None


class IssueIn(BaseModel):
    zone_id: int
    category: str
    description: str = Field(min_length=3)
    priority: str = "Minor"
    audit_id: int | None = None

    @field_validator("category")
    @classmethod
    def valid_cat(cls, v: str) -> str:
        if v not in ("1S", "2S", "3S", "4S", "5S"):
            raise ValueError("category must be 1S to 5S")
        return v

    @field_validator("priority")
    @classmethod
    def valid_pri(cls, v: str) -> str:
        if v not in ("Critical", "Major", "Minor"):
            raise ValueError("priority must be Critical, Major or Minor")
        return v


class AuditIn(BaseModel):
    zone_id: int
    planned_date: date
    auditor_ids: list[int] = []


class AuditPatch(BaseModel):
    planned_date: date | None = None
    status: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    missed_reason: str | None = None


class AllocationRow(BaseModel):
    audit_id: int
    auditor_ids: list[int]


class AllocationIn(BaseModel):
    rows: list[AllocationRow]


class CycleIn(BaseModel):
    cycle: str = Field(pattern=r"^\d{4}-\d{2}$")


class AuditResponseIn(BaseModel):
    checkpoint_id: int
    score: float

    @field_validator("score")
    @classmethod
    def valid_score(cls, v: float) -> float:
        if v not in (0, 0.5, 1, 1.5, 2):
            raise ValueError("score must be 0, 0.5, 1, 1.5 or 2")
        return v


class AuditSubmitIn(BaseModel):
    responses: list[AuditResponseIn] = Field(min_length=1)
