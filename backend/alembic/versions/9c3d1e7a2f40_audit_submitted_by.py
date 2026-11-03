"""audit submitted_by

Records which auditor submitted the checklist, so a co-auditor on the same zone
sees "Done · by <name>" instead of trying to submit again.

Revision ID: 9c3d1e7a2f40
Revises: 5b74110c8aef
Create Date: 2026-11-02 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c3d1e7a2f40'
down_revision: Union[str, None] = '5b74110c8aef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch mode so SQLite (local dev/tests) can add the foreign key too
    with op.batch_alter_table("audits") as batch:
        batch.add_column(sa.Column("submitted_by_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_audits_submitted_by_id_users", "users",
                                 ["submitted_by_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("audits") as batch:
        batch.drop_constraint("fk_audits_submitted_by_id_users", type_="foreignkey")
        batch.drop_column("submitted_by_id")
