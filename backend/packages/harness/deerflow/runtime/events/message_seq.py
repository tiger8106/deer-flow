"""Attach event-feed positions to serialized checkpoint messages."""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from typing import Any

from deerflow.runtime.events.message_identity import MESSAGE_SEQ_KEY, message_identity

logger = logging.getLogger(__name__)

__all__ = ["MessageSeqStamper", "stamp_messages_with_seq"]


class MessageSeqStamper:
    """Resolve each message identity at most once during one stream run."""

    __slots__ = ("_store", "_thread_id", "_seqs", "_missing")

    def __init__(self, store: Any, thread_id: str) -> None:
        self._store = store
        self._thread_id = thread_id
        self._seqs: dict[str, int] = {}
        self._missing: set[str] = set()

    async def stamp(self, payload: Any) -> Any:
        if self._store is None or not isinstance(payload, Mapping):
            return payload
        messages = payload.get("messages")
        if not isinstance(messages, list) or not messages:
            return payload

        identities = [
            message_identity(message) if isinstance(message, Mapping) else None
            for message in messages
        ]
        unresolved = {
            identity
            for identity in identities
            if identity is not None and identity not in self._seqs and identity not in self._missing
        }
        if unresolved:
            try:
                found = await self._store.get_message_seqs(self._thread_id, sorted(unresolved))
            except Exception:
                logger.warning(
                    "Failed to resolve message seqs for thread %s",
                    self._thread_id,
                    exc_info=True,
                )
                found = {}
            self._seqs.update(found)
            self._missing.update(unresolved - found.keys())

        stamped = [
            {
                **message,
                "additional_kwargs": {
                    **(message.get("additional_kwargs") or {}),
                    MESSAGE_SEQ_KEY: self._seqs[identity],
                },
            }
            if identity is not None
            and identity in self._seqs
            and isinstance(message, Mapping)
            else message
            for message, identity in zip(messages, identities, strict=True)
        ]
        return {**payload, "messages": stamped}


async def stamp_messages_with_seq(
    store: Any,
    thread_id: str,
    messages: Sequence[Any],
) -> list[Any]:
    """Return checkpoint messages with their persisted thread-feed positions.

    Checkpoints do not store the event-feed sequence.  Looking up the positions
    in one batch lets the frontend merge a compacted checkpoint with a paged
    feed without loading all earlier messages.  Missing positions are benign:
    legacy messages and non-persisted control messages keep the normal fallback
    ordering.
    """
    if store is None or not messages:
        return list(messages)

    if not hasattr(store, "get_message_seqs"):
        return list(messages)

    payload = await MessageSeqStamper(store, thread_id).stamp({"messages": list(messages)})
    stamped = payload.get("messages") if isinstance(payload, Mapping) else None
    if not isinstance(stamped, list):
        return list(messages)
    return stamped
