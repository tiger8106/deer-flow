"""scheduled task run active uniqueness."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

logger = logging.getLogger(__name__)

revision: str = "0007_scheduled_run_active_index"
down_revision: str | Sequence[str] | None = "0006_agents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _dedupe_active_scheduled_runs_per_task() -> None:
    bind = op.get_bind()
    superseded_message = (
        "interrupted during migration 0007_scheduled_run_active_index: "
        "superseded by a newer active run for the same scheduled task"
    )
    find_dupe_rows = sa.text(
        """
        SELECT id, task_id
        FROM scheduled_task_runs AS r1
        WHERE r1.status IN ('queued', 'running')
          AND EXISTS (
            SELECT 1 FROM scheduled_task_runs AS r2
            WHERE r2.task_id = r1.task_id
              AND r2.status IN ('queued', 'running')
              AND r2.id <> r1.id
              AND (
                r2.created_at > r1.created_at
                OR (r2.created_at = r1.created_at AND r2.id > r1.id)
              )
          )
        """
    )
    rows = list(bind.execute(find_dupe_rows).fetchall())
    if not rows:
        return
    for run_id, task_id in rows:
        logger.warning(
            "superseding duplicate active scheduled run %s on task %s",
            run_id,
            task_id,
        )
    update_stmt = sa.text(
        """
        UPDATE scheduled_task_runs
        SET status = 'interrupted',
            error = :error_message,
            finished_at = :finished_at
        WHERE status IN ('queued', 'running')
          AND EXISTS (
            SELECT 1 FROM scheduled_task_runs AS r2
            WHERE r2.task_id = scheduled_task_runs.task_id
              AND r2.status IN ('queued', 'running')
              AND r2.id <> scheduled_task_runs.id
              AND (
                r2.created_at > scheduled_task_runs.created_at
                OR (r2.created_at = scheduled_task_runs.created_at AND r2.id > scheduled_task_runs.id)
              )
          )
        """
    ).bindparams(
        sa.bindparam("error_message"),
        sa.bindparam("finished_at", type_=sa.DateTime(timezone=True)),
    )
    bind.execute(
        update_stmt,
        {"error_message": superseded_message, "finished_at": datetime.now(UTC)},
    )


def upgrade() -> None:
    existing = {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes("scheduled_task_runs")
    }
    if "uq_scheduled_task_run_active" in existing:
        return
    _dedupe_active_scheduled_runs_per_task()
    with op.batch_alter_table("scheduled_task_runs", schema=None) as batch_op:
        batch_op.create_index(
            "uq_scheduled_task_run_active",
            ["task_id"],
            unique=True,
            sqlite_where=sa.text("status IN ('queued', 'running')"),
            postgresql_where=sa.text("status IN ('queued', 'running')"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = {
        index["name"] for index in sa.inspect(bind).get_indexes("scheduled_task_runs")
    }
    if "uq_scheduled_task_run_active" not in existing:
        return
    with op.batch_alter_table("scheduled_task_runs", schema=None) as batch_op:
        batch_op.drop_index("uq_scheduled_task_run_active")
