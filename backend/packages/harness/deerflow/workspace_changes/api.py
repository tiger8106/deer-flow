from __future__ import annotations

from typing import Any

from .scanner import is_internal_workspace_path
from .types import WORKSPACE_CHANGES_EVENT_TYPE, WORKSPACE_CHANGES_METADATA_KEY

EMPTY_SUMMARY = {
    "created": 0,
    "modified": 0,
    "deleted": 0,
    "additions": 0,
    "deletions": 0,
    "truncated": False,
}


async def get_workspace_changes_response(
    event_store: Any,
    thread_id: str,
    run_id: str,
    *,
    include_files: bool = True,
    include_diff: bool = True,
) -> dict[str, Any]:
    events = await event_store.list_events(
        thread_id,
        run_id,
        event_types=[WORKSPACE_CHANGES_EVENT_TYPE],
        limit=10,
    )
    if not events:
        return _empty_response()

    payload = _extract_workspace_changes_payload(events[-1])
    if not isinstance(payload, dict):
        return _empty_response()

    response = dict(payload)
    files = response.get("files")
    if isinstance(files, list):
        visible_files = [
            file
            for file in files
            if not (
                isinstance(file, dict)
                and is_internal_workspace_path(str(file.get("path") or ""))
            )
        ]
        response["files"] = visible_files
        if len(visible_files) != len(files):
            response["summary"] = _summarize_files(
                visible_files,
                truncated=bool((response.get("summary") or {}).get("truncated")),
            )
    response.setdefault("summary", dict(EMPTY_SUMMARY))
    response["available"] = any(
        int(response["summary"].get(key) or 0)
        for key in ("created", "modified", "deleted")
    )
    if include_files:
        response.setdefault("files", [])
        if not include_diff:
            response["files"] = [_without_diff(file) for file in response["files"]]
    else:
        response["files"] = []
    return response


def _summarize_files(files: list[Any], *, truncated: bool) -> dict[str, Any]:
    summary = dict(EMPTY_SUMMARY)
    summary["truncated"] = truncated
    for file in files:
        if not isinstance(file, dict):
            continue
        status = file.get("status")
        if status in ("created", "modified", "deleted"):
            summary[status] += 1
        summary["additions"] += int(file.get("additions") or 0)
        summary["deletions"] += int(file.get("deletions") or 0)
    return summary


def _empty_response() -> dict[str, Any]:
    return {
        "available": False,
        "version": 1,
        "summary": dict(EMPTY_SUMMARY),
        "files": [],
        "limits": {},
    }


def _extract_workspace_changes_payload(event: dict[str, Any]) -> Any:
    metadata = event.get("metadata") or {}
    if isinstance(metadata, dict) and WORKSPACE_CHANGES_METADATA_KEY in metadata:
        return metadata[WORKSPACE_CHANGES_METADATA_KEY]
    content = event.get("content")
    if isinstance(content, dict):
        return content
    return None


def _without_diff(file: Any) -> Any:
    if not isinstance(file, dict):
        return file
    sanitized = dict(file)
    sanitized["diff"] = ""
    return sanitized
