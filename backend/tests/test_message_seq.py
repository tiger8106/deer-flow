from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from deerflow.runtime.events.message_seq import MessageSeqStamper, stamp_messages_with_seq
from deerflow.runtime.events.store.memory import MemoryRunEventStore


def test_checkpoint_messages_receive_event_feed_positions_without_mutation():
    store = MemoryRunEventStore()
    asyncio.run(
        store.put(
            thread_id="thread-1",
            run_id="run-1",
            event_type="llm.ai.response",
            category="message",
            content={"id": "ai-1", "type": "ai", "content": "answer"},
        )
    )
    messages = [
        {"id": "ai-1", "type": "ai", "content": "answer"},
        {"id": "legacy", "type": "human", "content": "old"},
    ]

    stamped = asyncio.run(stamp_messages_with_seq(store, "thread-1", messages))

    assert messages[0].get("additional_kwargs") is None
    assert stamped[0]["additional_kwargs"]["deerflow_seq"] == 1
    assert stamped[1] == messages[1]


def test_stream_stamper_caches_resolved_and_missing_identities():
    lookup = AsyncMock(return_value={"message:ai-1": 7})
    stamper = MessageSeqStamper(SimpleNamespace(get_message_seqs=lookup), "thread-1")
    payload = {"messages": [{"id": "ai-1", "type": "ai", "content": "answer"}]}

    first = asyncio.run(stamper.stamp(payload))
    second = asyncio.run(stamper.stamp(payload))

    assert lookup.await_count == 1
    assert first["messages"][0]["additional_kwargs"]["deerflow_seq"] == 7
    assert second == first


def test_stream_stamper_retries_positions_that_were_not_yet_persisted():
    lookup = AsyncMock(side_effect=[{}, {"message:ai-1": 7}])
    stamper = MessageSeqStamper(SimpleNamespace(get_message_seqs=lookup), "thread-1")
    payload = {"messages": [{"id": "ai-1", "type": "ai", "content": "answer"}]}
    assert "additional_kwargs" not in asyncio.run(stamper.stamp(payload))["messages"][0]
    assert asyncio.run(stamper.stamp(payload))["messages"][0]["additional_kwargs"]["deerflow_seq"] == 7
    asyncio.run(stamper.stamp(payload))
    assert lookup.await_count == 2
