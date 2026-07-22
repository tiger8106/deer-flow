"""Regression coverage for promoting the earliest account on legacy installs."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import Session

import deerflow.persistence.models  # noqa: F401
from deerflow.persistence.base import Base
from deerflow.persistence.engine import close_engine, init_engine
from deerflow.persistence.user.model import UserRow

pytestmark = pytest.mark.asyncio


def _seed_users_without_admin(db_path: Path) -> None:
    engine = sa.create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(sa.text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"))
            connection.execute(sa.text("DELETE FROM alembic_version"))
            connection.execute(sa.text("INSERT INTO alembic_version (version_num) VALUES ('0004_run_ownership')"))
        created_at = datetime.now(UTC)
        with Session(engine) as session:
            session.add_all(
                [
                    UserRow(
                        id="00000000-0000-0000-0000-000000000001",
                        email="first@example.com",
                        system_role="user",
                        created_at=created_at,
                    ),
                    UserRow(
                        id="00000000-0000-0000-0000-000000000002",
                        email="second@example.com",
                        system_role="user",
                        created_at=created_at + timedelta(seconds=1),
                    ),
                ]
            )
            session.commit()
    finally:
        engine.dispose()


async def test_migration_promotes_only_earliest_user_when_no_admin(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy-users.db"
    _seed_users_without_admin(db_path)

    await init_engine(
        backend="sqlite",
        url=f"sqlite+aiosqlite:///{db_path.as_posix()}",
        sqlite_dir=str(tmp_path),
    )
    try:
        with sqlite3.connect(db_path) as connection:
            roles = connection.execute("SELECT email, system_role FROM users ORDER BY created_at").fetchall()
            version = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        assert roles == [
            ("first@example.com", "admin"),
            ("second@example.com", "user"),
        ]
        assert version == ("0005_first_user_admin",)
    finally:
        await close_engine()
