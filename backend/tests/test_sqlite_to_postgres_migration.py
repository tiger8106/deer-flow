from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import sqlalchemy as sa

from scripts.migrate_sqlite_to_postgres import (
    _convert_value,
    checkpoint_parent_config,
    checkpoint_writes_digest,
    discover_memory_files,
)


def test_convert_value_handles_cross_database_types() -> None:
    metadata = sa.MetaData()
    table = sa.Table(
        "sample",
        metadata,
        sa.Column("payload", sa.JSON),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("enabled", sa.Boolean),
    )

    assert _convert_value(table.c.payload, '{"answer": 42}') == {"answer": 42}
    assert _convert_value(table.c.created_at, "2026-08-12T10:00:00+00:00").tzinfo is not None
    assert _convert_value(table.c.enabled, 1) is True


def test_discover_memory_files_preserves_user_and_agent_scope(tmp_path: Path) -> None:
    (tmp_path / "memory.json").write_text(json.dumps({"facts": []}), encoding="utf-8")
    user_dir = tmp_path / "users" / "user-1"
    user_dir.mkdir(parents=True)
    (user_dir / "memory.json").write_text(json.dumps({"facts": []}), encoding="utf-8")
    agent_dir = user_dir / "agents" / "research-agent"
    agent_dir.mkdir(parents=True)
    (agent_dir / "memory.json").write_text(json.dumps({"facts": []}), encoding="utf-8")
    (user_dir / "memory.json.v1.bak").write_text("{}", encoding="utf-8")

    discovered = discover_memory_files(tmp_path)

    assert [(item.user_id, item.agent_name) for item in discovered] == [
        (None, None),
        ("user-1", None),
        ("user-1", "research-agent"),
    ]


def test_checkpoint_parent_config_preserves_parent_or_builds_root() -> None:
    parent = {"configurable": {"thread_id": "thread-1", "checkpoint_ns": "", "checkpoint_id": "parent"}}
    child = SimpleNamespace(
        parent_config=parent,
        config={"configurable": {"thread_id": "thread-1", "checkpoint_ns": ""}},
    )
    root = SimpleNamespace(
        parent_config=None,
        config={"configurable": {"thread_id": "thread-1", "checkpoint_ns": "nested"}},
    )

    assert checkpoint_parent_config(child) is parent
    assert checkpoint_parent_config(root) == {
        "configurable": {"thread_id": "thread-1", "checkpoint_ns": "nested"}
    }


def test_checkpoint_write_digest_is_unambiguous_and_binary_safe() -> None:
    rows = [("thread", "", "checkpoint", "task", 0, "channel", "msgpack", b"a|b")]

    assert checkpoint_writes_digest(rows) == checkpoint_writes_digest(list(rows))
    assert checkpoint_writes_digest(rows) != checkpoint_writes_digest(
        [("thread", "", "checkpoint", "task", 0, "channel", "msgpack", b"a"), ("b",)]
    )
