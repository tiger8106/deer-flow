"""Add database-backed long-term memory.

Revision ID: 0013_postgres_memory
Revises: 0012_merge_tiger_admin
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_postgres_memory"
down_revision: str | Sequence[str] | None = "0012_merge_tiger_admin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("deerflow_memories"):
        return
    op.create_table(
        "deerflow_memories",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("agent_name", sa.String(length=128), nullable=False),
        sa.Column("memory_data", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "agent_name"),
    )


def downgrade() -> None:
    op.drop_table("deerflow_memories")
