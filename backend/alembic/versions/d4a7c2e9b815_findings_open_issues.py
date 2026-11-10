"""findings open issues

Links each audit finding to an Issue so the zone's 5S Incharge can close it with an after
photo. Adds audit_responses.issue_id and opens an Issue for every existing finding.

Revision ID: d4a7c2e9b815
Revises: b1f2a9c0d731
Create Date: 2026-11-10 00:00:00

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a7c2e9b815'
down_revision: Union[str, None] = 'b1f2a9c0d731'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("audit_responses")}
    if "issue_id" not in cols:
        with op.batch_alter_table("audit_responses") as batch:
            batch.add_column(sa.Column("issue_id", sa.Integer(), nullable=True))
            batch.create_foreign_key("fk_audit_responses_issue_id_issues", "issues",
                                     ["issue_id"], ["id"], ondelete="SET NULL")
            batch.create_index("ix_audit_responses_issue_id", ["issue_id"])

    # Backfill: open an Issue for every finding that has none yet.
    rows = bind.execute(sa.text(
        "SELECT f.id, f.audit_id, f.category, f.remark, f.photo_url, f.recorded_at, a.zone_id, "
        "a.submitted_by_id, (SELECT MIN(aa.user_id) FROM audit_auditors aa WHERE aa.audit_id = a.id) "
        "FROM audit_responses f JOIN audits a ON a.id = f.audit_id WHERE f.issue_id IS NULL ORDER BY f.id"
    )).fetchall()
    if not rows:
        return
    admin = bind.execute(sa.text("SELECT MIN(id) FROM users WHERE role = 'Super Admin'")).scalar()
    for fid, audit_id, cat, remark, photo, rec, zone_id, sub_by, first_aud in rows:
        raiser = sub_by or first_aud or admin
        if raiser is None:
            continue
        tmp = f"TMP-F{fid}"
        bind.execute(sa.text(
            "INSERT INTO issues (code, zone_id, audit_id, category, description, priority, status, "
            "raised_by_id, raised_at, before_photo, escalation_level) VALUES "
            "(:code, :zone, :audit, :cat, :desc, 'Minor', 'Open', :by, :at, :photo, 0)"),
            {"code": tmp, "zone": zone_id, "audit": audit_id, "cat": cat, "desc": remark,
             "by": raiser, "at": rec or datetime.now(), "photo": photo})
        iid = bind.execute(sa.text("SELECT id FROM issues WHERE code = :c"), {"c": tmp}).scalar()
        bind.execute(sa.text("UPDATE issues SET code = :c WHERE id = :i"), {"c": f"VD-{1000 + iid}", "i": iid})
        bind.execute(sa.text("UPDATE audit_responses SET issue_id = :i WHERE id = :f"), {"i": iid, "f": fid})


def downgrade() -> None:
    with op.batch_alter_table("audit_responses") as batch:
        batch.drop_index("ix_audit_responses_issue_id")
        batch.drop_constraint("fk_audit_responses_issue_id_issues", type_="foreignkey")
        batch.drop_column("issue_id")
