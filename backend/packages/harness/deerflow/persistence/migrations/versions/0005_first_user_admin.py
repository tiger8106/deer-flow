"""Promote the earliest existing account when an installation has no admin.

Revision ID: 0005_first_user_admin
Revises: 0004_run_ownership
Create Date: 2026-07-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_first_user_admin"
down_revision: str | Sequence[str] | None = "0004_run_ownership"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Older versions allowed /register to create ordinary users before an
    # administrator existed. Preserve the first-account invariant for those
    # installations without changing databases that already have an admin.
    op.get_bind().execute(
        sa.text(
            """
            UPDATE users
            SET system_role = 'admin'
            WHERE id = (
                SELECT id
                FROM users
                WHERE NOT EXISTS (
                    SELECT 1 FROM users AS administrators
                    WHERE administrators.system_role = 'admin'
                )
                ORDER BY created_at, id
                LIMIT 1
            )
            """
        )
    )


def downgrade() -> None:
    # The migration cannot distinguish a promoted account from an account that
    # was independently made administrator after upgrade.
    pass
