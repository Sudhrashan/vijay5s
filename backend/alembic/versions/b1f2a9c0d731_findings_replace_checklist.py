"""findings replace checklist

Replaces the 34-checkpoint scored audit checklist with a simple photo+category+remark
finding flow. Drops the checkpoints table, drops and recreates audit_responses as the
findings table (audit_id, category, remark, photo_url, created_at -- no more
checkpoint_id/score), and drops audits.score.

Revision ID: b1f2a9c0d731
Revises: 9c3d1e7a2f40
Create Date: 2026-11-03 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1f2a9c0d731'
down_revision: Union[str, None] = '9c3d1e7a2f40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop and recreate audit_responses as the findings table. The old rows (scored
    # checkpoint answers) have no meaning under the new flow, so there is nothing to migrate.
    op.drop_table("audit_responses")
    op.create_table(
        "audit_responses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("audit_id", sa.Integer(), sa.ForeignKey("audits.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("category", sa.String(length=2), index=True, nullable=False),
        sa.Column("remark", sa.Text(), nullable=False),
        sa.Column("photo_url", sa.String(length=300), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), server_default=sa.func.now()),
    )

    with op.batch_alter_table("audits") as batch:
        batch.drop_column("score")

    op.drop_table("checkpoints")


def downgrade() -> None:
    op.create_table(
        "checkpoints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(length=2), index=True),
        sa.Column("order", sa.Integer()),
        sa.Column("text", sa.Text()),
    )
    with op.batch_alter_table("audits") as batch:
        batch.add_column(sa.Column("score", sa.Integer(), nullable=True))

    op.drop_table("audit_responses")
    op.create_table(
        "audit_responses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("audit_id", sa.Integer(), sa.ForeignKey("audits.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("checkpoint_id", sa.Integer(), sa.ForeignKey("checkpoints.id", ondelete="RESTRICT"), index=True, nullable=False),
        sa.Column("score", sa.Numeric(2, 1), nullable=False),
        sa.Column("photo_url", sa.String(length=300), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), server_default=sa.func.now()),
    )
