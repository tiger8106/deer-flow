"""Migrate one unified DeerFlow SQLite database into PostgreSQL.

The target database must not contain DeerFlow application/checkpoint/store
rows. Knowledge or other prefixed business tables may already be present.

Usage::

    PYTHONPATH=. uv run --extra postgres python scripts/migrate_sqlite_to_postgres.py \
        --source .deer-flow/data/deerflow.db --target-url "$DATABASE_URL"
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from deerflow.agents.memory.storage import PostgresMemoryStorage
from deerflow.persistence.bootstrap import _get_alembic_config, _upgrade

logger = logging.getLogger("deerflow.sqlite_to_postgres")

APP_TABLE_ORDER = (
    "users",
    "threads_meta",
    "runs",
    "run_events",
    "feedback",
    "scheduled_tasks",
    "scheduled_task_runs",
    "agents",
    "channel_connections",
    "channel_conversations",
    "channel_oauth_states",
    "channel_credentials",
    "webhook_deliveries",
    "mcp_tasks",
)


@dataclass(frozen=True)
class MemoryFile:
    path: Path
    user_id: str | None
    agent_name: str | None


def _sqlite_tables(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }


def _sqlite_count(connection: sqlite3.Connection, table: str) -> int:
    if table not in _sqlite_tables(connection):
        return 0
    return int(connection.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0])


def _convert_value(column: sa.Column, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(column.type, sa.JSON) and isinstance(value, (str, bytes)):
        return json.loads(value)
    if isinstance(column.type, sa.DateTime) and isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(column.type, sa.Boolean):
        return bool(value)
    return value


def discover_memory_files(base_dir: Path) -> list[MemoryFile]:
    """Discover global, per-user, and per-user-agent memory JSON files."""
    discovered: list[MemoryFile] = []
    global_file = base_dir / "memory.json"
    if global_file.is_file():
        discovered.append(MemoryFile(global_file, None, None))

    users_dir = base_dir / "users"
    if not users_dir.is_dir():
        return discovered
    for user_dir in sorted(path for path in users_dir.iterdir() if path.is_dir()):
        user_file = user_dir / "memory.json"
        if user_file.is_file():
            discovered.append(MemoryFile(user_file, user_dir.name, None))
        agents_dir = user_dir / "agents"
        if not agents_dir.is_dir():
            continue
        for agent_dir in sorted(path for path in agents_dir.iterdir() if path.is_dir()):
            agent_file = agent_dir / "memory.json"
            if agent_file.is_file():
                discovered.append(
                    MemoryFile(agent_file, user_dir.name, agent_dir.name)
                )
    return discovered


def checkpoint_parent_config(checkpoint_tuple) -> dict[str, Any]:
    if checkpoint_tuple.parent_config is not None:
        return checkpoint_tuple.parent_config
    configurable = checkpoint_tuple.config["configurable"]
    return {
        "configurable": {
            "thread_id": configurable["thread_id"],
            "checkpoint_ns": configurable.get("checkpoint_ns", ""),
        }
    }


def _async_url(target_url: str) -> str:
    if target_url.startswith("postgresql+asyncpg://"):
        return target_url
    if target_url.startswith("postgresql+psycopg://"):
        return target_url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
    if target_url.startswith("postgresql://"):
        return target_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    raise ValueError("target URL must use PostgreSQL")


async def _reflect_target_tables(
    engine: AsyncEngine, names: list[str]
) -> dict[str, sa.Table]:
    def reflect(sync_connection) -> dict[str, sa.Table]:
        metadata = sa.MetaData()
        return {
            name: sa.Table(name, metadata, autoload_with=sync_connection)
            for name in names
        }

    async with engine.connect() as connection:
        return await connection.run_sync(reflect)


async def _ensure_empty_target(
    engine: AsyncEngine, table_names: list[str]
) -> None:
    tables = await _reflect_target_tables(engine, table_names)
    async with engine.connect() as connection:
        nonempty = {}
        for name, table in tables.items():
            count = int((await connection.execute(sa.select(sa.func.count()).select_from(table))).scalar_one())
            if count:
                nonempty[name] = count
    if nonempty:
        details = ", ".join(f"{name}={count}" for name, count in sorted(nonempty.items()))
        raise RuntimeError(f"target DeerFlow tables are not empty: {details}")


async def _prepare_target_schema(engine: AsyncEngine) -> None:
    config = _get_alembic_config(engine)
    await asyncio.to_thread(_upgrade, config, "head")


async def _migrate_application_tables(
    source: sqlite3.Connection,
    target_engine: AsyncEngine,
) -> dict[str, int]:
    source_tables = _sqlite_tables(source)
    names = [name for name in APP_TABLE_ORDER if name in source_tables]
    target_tables = await _reflect_target_tables(target_engine, names)
    await _ensure_empty_target(target_engine, names)
    counts: dict[str, int] = {}

    for name in names:
        table = target_tables[name]
        source_columns = {
            row[1] for row in source.execute(f'PRAGMA table_info("{name}")')
        }
        columns = [column for column in table.columns if column.name in source_columns]
        rows: list[dict[str, Any]] = []
        source.row_factory = sqlite3.Row
        for row in source.execute(f'SELECT * FROM "{name}"'):
            rows.append(
                {
                    column.name: _convert_value(column, row[column.name])
                    for column in columns
                }
            )
        if rows:
            async with target_engine.begin() as connection:
                for offset in range(0, len(rows), 200):
                    await connection.execute(sa.insert(table), rows[offset : offset + 200])
        counts[name] = len(rows)

    if target_engine.dialect.name == "postgresql":
        async with target_engine.begin() as connection:
            for name, table in target_tables.items():
                for column in table.primary_key.columns:
                    if not isinstance(column.type, sa.Integer):
                        continue
                    await connection.execute(
                        sa.text(
                            "SELECT setval(pg_get_serial_sequence(:table_name, :column_name), "
                            f"COALESCE((SELECT max(\"{column.name}\") FROM \"{name}\"), 1), "
                            f"EXISTS (SELECT 1 FROM \"{name}\"))"
                        ),
                        {"table_name": name, "column_name": column.name},
                    )
    return counts


async def _migrate_checkpoints(source_path: Path, target_url: str) -> dict[str, int]:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    migrated_checkpoints = 0
    migrated_writes = 0
    async with (
        AsyncSqliteSaver.from_conn_string(str(source_path)) as source_saver,
        # LangGraph setup creates an index concurrently, which PostgreSQL does
        # not allow inside psycopg pipeline mode. Keep the migration connection
        # non-pipelined so first-time setup and row writes share one safe path.
        AsyncPostgresSaver.from_conn_string(target_url) as target_saver,
    ):
        await source_saver.setup()
        await target_saver.setup()
        async for item in source_saver.alist(None):
            await target_saver.aput(
                checkpoint_parent_config(item),
                item.checkpoint,
                item.metadata,
                item.checkpoint.get("channel_versions", {}),
            )
            migrated_checkpoints += 1
            if migrated_checkpoints % 100 == 0:
                logger.info("migrated %d checkpoints", migrated_checkpoints)

        with sqlite3.connect(source_path) as raw:
            source_writes = raw.execute(
                "SELECT thread_id, checkpoint_ns, checkpoint_id, task_id, idx, "
                "channel, type, value FROM writes "
                "ORDER BY thread_id, checkpoint_ns, checkpoint_id, task_id, idx"
            ).fetchall()
            latest_scopes = raw.execute(
                "SELECT DISTINCT thread_id, checkpoint_ns FROM checkpoints"
            ).fetchall()

        # Saver.aput_writes() intentionally recalculates special negative
        # indices from channel names. Historical SQLite rows already carry
        # their authoritative idx; recalculation can merge old duplicates.
        # The serialized (type, value) format is LangGraph's shared serde
        # contract, so copy those rows directly while checkpoints themselves
        # continue to flow through the public Saver API.
        direct_rows = [
            (
                thread_id,
                checkpoint_ns,
                checkpoint_id,
                task_id,
                "",
                idx,
                channel,
                type_name,
                value,
            )
            for (
                thread_id,
                checkpoint_ns,
                checkpoint_id,
                task_id,
                idx,
                channel,
                type_name,
                value,
            ) in source_writes
        ]
        async with target_saver._cursor(pipeline=True) as cursor:
            for offset in range(0, len(direct_rows), 500):
                await cursor.executemany(
                    target_saver.INSERT_CHECKPOINT_WRITES_SQL,
                    direct_rows[offset : offset + 500],
                )
        migrated_writes = len(direct_rows)

        async with target_saver._cursor() as cursor:
            await cursor.execute(
                "SELECT thread_id, checkpoint_ns, checkpoint_id, task_id, idx, "
                "channel, type, blob FROM checkpoint_writes "
                "ORDER BY thread_id, checkpoint_ns, checkpoint_id, task_id, idx",
                binary=True,
            )
            target_writes = await cursor.fetchall()
        source_digest = checkpoint_writes_digest(source_writes)
        target_digest = checkpoint_writes_digest(
            [
                (
                    row["thread_id"],
                    row["checkpoint_ns"],
                    row["checkpoint_id"],
                    row["task_id"],
                    row["idx"],
                    row["channel"],
                    row["type"],
                    bytes(row["blob"]),
                )
                for row in target_writes
            ]
        )
        if source_digest != target_digest:
            raise RuntimeError("checkpoint write digest mismatch")

        for thread_id, checkpoint_ns in latest_scopes:
            config = {
                "configurable": {
                    "thread_id": thread_id,
                    "checkpoint_ns": checkpoint_ns,
                }
            }
            source_latest = await source_saver.aget_tuple(config)
            target_latest = await target_saver.aget_tuple(config)
            if source_latest is None or target_latest is None:
                raise RuntimeError(f"missing latest checkpoint after migration: {thread_id}")
            if source_latest.checkpoint["id"] != target_latest.checkpoint["id"]:
                raise RuntimeError(f"latest checkpoint mismatch after migration: {thread_id}")
            if source_latest.checkpoint.get("channel_versions") != target_latest.checkpoint.get("channel_versions"):
                raise RuntimeError(f"channel version mismatch after migration: {thread_id}")

    return {"checkpoints": migrated_checkpoints, "checkpoint_writes": migrated_writes}


def checkpoint_writes_digest(rows: list[tuple[Any, ...]]) -> str:
    """Hash ordered pending-write rows without delimiter ambiguity."""
    digest = hashlib.sha256()
    for row in rows:
        for value in row:
            encoded = value if isinstance(value, bytes) else str(value if value is not None else "").encode()
            digest.update(len(encoded).to_bytes(8, "big"))
            digest.update(encoded)
    return digest.hexdigest()


async def _migrate_store(source_path: Path, target_url: str) -> int:
    from langgraph.store.postgres.aio import AsyncPostgresStore
    from langgraph.store.sqlite.aio import AsyncSqliteStore

    with sqlite3.connect(source_path) as raw:
        if _sqlite_count(raw, "store") == 0:
            async with AsyncPostgresStore.from_conn_string(target_url) as target_store:
                await target_store.setup()
            return 0

    migrated = 0
    seen: set[tuple[tuple[str, ...], str]] = set()
    async with (
        AsyncSqliteStore.from_conn_string(str(source_path)) as source_store,
        AsyncPostgresStore.from_conn_string(target_url) as target_store,
    ):
        await source_store.setup()
        await target_store.setup()
        namespaces = await source_store.alist_namespaces(limit=10000)
        for namespace in namespaces:
            offset = 0
            while True:
                items = await source_store.asearch(namespace, limit=100, offset=offset)
                if not items:
                    break
                for item in items:
                    identity = (item.namespace, item.key)
                    if identity in seen:
                        continue
                    seen.add(identity)
                    await target_store.aput(item.namespace, item.key, item.value)
                    migrated += 1
                offset += len(items)
    return migrated


async def _migrate_memories(base_dir: Path, target_url: str) -> int:
    provider = PostgresMemoryStorage(connection_string=target_url)
    migrated = 0
    for memory_file in discover_memory_files(base_dir):
        payload = json.loads(memory_file.path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise RuntimeError(f"memory file is not a JSON object: {memory_file.path}")
        saved = await asyncio.to_thread(
            provider.import_payload,
            payload,
            memory_file.agent_name,
            user_id=memory_file.user_id,
        )
        if not saved:
            raise RuntimeError(f"failed to migrate memory file: {memory_file.path}")
        migrated_payload = await asyncio.to_thread(
            provider.load,
            memory_file.agent_name,
            user_id=memory_file.user_id,
        )
        if migrated_payload != payload:
            raise RuntimeError(f"memory payload mismatch after migration: {memory_file.path}")
        migrated += 1
    return migrated


def _source_report(source_path: Path, memory_base: Path) -> dict[str, int]:
    with sqlite3.connect(f"file:{source_path.resolve()}?mode=ro", uri=True) as source:
        report = {
            name: _sqlite_count(source, name)
            for name in (*APP_TABLE_ORDER, "checkpoints", "writes", "store")
            if name in _sqlite_tables(source)
        }
    report["memory_files"] = len(discover_memory_files(memory_base))
    return report


async def migrate(args: argparse.Namespace) -> dict[str, int]:
    source_path = args.source.resolve()
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    memory_base = (args.memory_base or source_path.parent.parent).resolve()
    report = _source_report(source_path, memory_base)
    if args.dry_run:
        return report
    if args.memory_only:
        memory_count = await _migrate_memories(memory_base, args.target_url)
        if memory_count != report["memory_files"]:
            raise RuntimeError("memory row count mismatch")
        return {"memory_files": memory_count}

    target_engine = create_async_engine(_async_url(args.target_url))
    try:
        await _prepare_target_schema(target_engine)
        with sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source:
            app_counts = await _migrate_application_tables(source, target_engine)
        if app_counts != {name: report[name] for name in app_counts}:
            raise RuntimeError("application row counts changed while migrating")
        checkpoint_counts = await _migrate_checkpoints(source_path, args.target_url)
        if checkpoint_counts["checkpoints"] != report.get("checkpoints", 0):
            raise RuntimeError("checkpoint count mismatch")
        if checkpoint_counts["checkpoint_writes"] != report.get("writes", 0):
            raise RuntimeError("checkpoint write count mismatch")
        store_count = await _migrate_store(source_path, args.target_url)
        if store_count != report.get("store", 0):
            raise RuntimeError("store row count mismatch")
        memory_count = await _migrate_memories(memory_base, args.target_url)
        if memory_count != report["memory_files"]:
            raise RuntimeError("memory row count mismatch")
        return {
            **app_counts,
            **checkpoint_counts,
            "store": store_count,
            "memory_files": memory_count,
        }
    finally:
        await target_engine.dispose()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--target-url", required=True)
    parser.add_argument("--memory-base", type=Path)
    parser.add_argument(
        "--memory-only",
        action="store_true",
        help="only import memory JSON files into an already migrated target",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = asyncio.run(migrate(parse_args()))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
