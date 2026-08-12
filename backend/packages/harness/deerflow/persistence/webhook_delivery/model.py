"""ORM model for cross-process inbound webhook deduplication."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, PrimaryKeyConstraint, String, func
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


class WebhookDeliveryRow(Base):
    __tablename__ = "webhook_deliveries"

    channel: Mapped[str] = mapped_column(String(64), nullable=False)
    workspace_id: Mapped[str] = mapped_column(String(512), nullable=False)
    chat_id: Mapped[str] = mapped_column(String(512), nullable=False)
    message_id: Mapped[str] = mapped_column(String(1024), nullable=False)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        PrimaryKeyConstraint(
            "channel",
            "workspace_id",
            "chat_id",
            "message_id",
            name="pk_webhook_deliveries",
        ),
        Index("ix_webhook_deliveries_first_seen", "first_seen"),
    )
