from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.gateway.run_policy import RemoteRunPolicyClient, classify_run_request
from deerflow.runtime import DisconnectMode, RunRecord, RunStatus


def _body(*, metadata=None, context=None, command=None):
    return SimpleNamespace(
        assistant_id="lead-agent",
        input={"messages": [{"role": "user", "content": "hello"}]},
        metadata=metadata or {},
        context=context or {},
        command=command,
    )


def test_classify_regenerate_before_ordinary_chat():
    assert classify_run_request(_body()) == "chat"
    assert classify_run_request(_body(metadata={"regenerate_from_message_id": "assistant-message"})) == "regenerate"
    assert classify_run_request(_body(context={"non_interactive": True})) == "scheduled"


@pytest.mark.asyncio
async def test_remote_policy_sends_regenerate_as_a_chargeable_admission():
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.update(__import__("json").loads(request.content))
        return httpx.Response(
            200,
            json={"allowed": True, "admission_id": captured["admission_id"]},
        )

    client = RemoteRunPolicyClient(
        "http://policy.test",
        "token",
        transport=httpx.MockTransport(handler),
    )
    admission = await client.admit(
        body=_body(metadata={"regenerate_from_message_id": "message-1"}),
        thread_id="thread-1",
        user=SimpleNamespace(id="user-1", email="user@test.com", system_role="user"),
    )

    assert admission.reserved
    assert captured["request_kind"] == "regenerate"
    assert captured["user_id"] == "user-1"


@pytest.mark.asyncio
async def test_remote_policy_surfaces_structured_quota_exhaustion():
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "allowed": False,
                "reason": "quota_exhausted",
                "limit": 2,
                "consumed": 2,
                "remaining": 0,
                "reset_at": "2026-08-05T00:00:00+08:00",
            },
        )

    client = RemoteRunPolicyClient(
        "http://policy.test",
        "token",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(HTTPException) as exc_info:
        await client.admit(
            body=_body(),
            thread_id="thread-1",
            user=SimpleNamespace(id="user-1", email="user@test.com", system_role="user"),
        )

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["code"] == "quota_exhausted"
    assert exc_info.value.detail["remaining"] == 0


@pytest.mark.asyncio
async def test_admin_and_scheduled_runs_do_not_call_remote_policy():
    async def unexpected(_: httpx.Request) -> httpx.Response:
        raise AssertionError("remote policy should not be called")

    client = RemoteRunPolicyClient(
        "http://policy.test",
        "token",
        transport=httpx.MockTransport(unexpected),
    )
    admin = await client.admit(
        body=_body(),
        thread_id="thread-1",
        user=SimpleNamespace(id="admin", email="admin@test.com", system_role="admin"),
    )
    scheduled = await client.admit(
        body=_body(context={"non_interactive": True}),
        thread_id="thread-1",
        user=SimpleNamespace(id="user", email="user@test.com", system_role="user"),
    )
    assert not admin.reserved
    assert not scheduled.reserved


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "last_ai_message", "expected_has_response"),
    [
        (RunStatus.success, "answer", True),
        (RunStatus.success, None, False),
        (RunStatus.error, "partial answer", False),
    ],
)
async def test_completion_only_counts_a_successful_user_visible_reply(
    status,
    last_ai_message,
    expected_has_response,
):
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.update(__import__("json").loads(request.content))
        return httpx.Response(200, json={"ok": True, "matched": True})

    client = RemoteRunPolicyClient(
        "http://policy.test",
        "token",
        transport=httpx.MockTransport(handler),
    )
    record = RunRecord(
        run_id="run-1",
        thread_id="thread-1",
        assistant_id="lead-agent",
        status=status,
        on_disconnect=DisconnectMode.continue_,
        last_ai_message=last_ai_message,
    )

    await client.complete(record)

    assert captured["has_response"] is expected_has_response
