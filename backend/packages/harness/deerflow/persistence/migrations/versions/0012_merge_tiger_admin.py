"""Merge the upstream migration chain with Tiger's first-admin migration."""

from __future__ import annotations

from collections.abc import Sequence

revision: str = "0012_merge_tiger_admin"
down_revision: str | Sequence[str] | None = ("0011_mcp_tasks", "0005_first_user_admin")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
