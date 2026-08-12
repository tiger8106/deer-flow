"""ORM model for PostgreSQL-backed long-term memory."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


class MemoryRow(Base):
    __tablename__ = "deerflow_memories"

    # Empty strings represent the legacy global scopes where user_id or
    # agent_name was omitted. Real user and agent identifiers are non-empty.
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True, default="")
    agent_name: Mapped[str] = mapped_column(String(128), primary_key=True, default="")
    memory_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
