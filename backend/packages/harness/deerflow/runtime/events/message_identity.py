"""Stable display identity shared by the event feed and checkpoint messages."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

__all__ = ["MESSAGE_SEQ_KEY", "message_identity"]

# Server-owned metadata attached to serialized messages.  It is deliberately
# kept in ``additional_kwargs`` so it survives the LangChain wire format while
# remaining separate from the event record's own ``seq`` field.
MESSAGE_SEQ_KEY = "deerflow_seq"


def message_identity(message: Mapping[str, Any]) -> str | None:
    """Return the same identity used by the frontend message merge logic."""
    tool_call_id = message.get("tool_call_id")
    if isinstance(tool_call_id, str) and tool_call_id:
        return f"tool:{tool_call_id}"

    message_id = message.get("id")
    if isinstance(message_id, str) and message_id:
        return f"message:{message_id}"
    return None
