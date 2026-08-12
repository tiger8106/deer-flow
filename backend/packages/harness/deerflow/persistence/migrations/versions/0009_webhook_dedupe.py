"""Cross-pod inbound webhook dedupe table."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_webhook_dedupe"
down_revision: str | Sequence[str] | None = "0008_thread_operation_kind"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("webhook_deliveries"):
        return
    op.create_table(
        "webhook_deliveries",
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=512), nullable=False),
        sa.Column("chat_id", sa.String(length=512), nullable=False),
        sa.Column("message_id", sa.String(length=1024), nullable=False),
        sa.Column(
            "first_seen",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint(
            "channel",
            "workspace_id",
            "chat_id",
            "message_id",
            name="pk_webhook_deliveries",
        ),
    )
    op.create_index(
        "ix_webhook_deliveries_first_seen",
        "webhook_deliveries",
        ["first_seen"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("webhook_deliveries"):
        return
    op.drop_index("ix_webhook_deliveries_first_seen", table_name="webhook_deliveries")
    op.drop_table("webhook_deliveries")
