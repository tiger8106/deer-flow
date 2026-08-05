"""Optional remote run-admission policy extension.

The Gateway owns only the lifecycle contract. Deployments may point it at an
external policy service for quotas, billing, or tenant rules without importing
those business concepts into DeerFlow.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx
from fastapi import HTTPException

from deerflow.runtime import RunRecord, RunStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RunAdmission:
    admission_id: str | None = None

    @property
    def reserved(self) -> bool:
        return self.admission_id is not None


def classify_run_request(body: Any) -> str:
    context = getattr(body, "context", None) or {}
    metadata = getattr(body, "metadata", None) or {}
    if context.get("non_interactive") is True:
        return "scheduled"
    if metadata.get("regenerate_from_message_id"):
        return "regenerate"
    if getattr(body, "command", None):
        return "resume"
    if getattr(body, "input", None) is None:
        return "stateless"
    return "chat"


class RemoteRunPolicyClient:
    def __init__(
        self,
        base_url: str | None,
        token: str | None,
        *,
        timeout_seconds: float = 5.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/") if base_url else None
        self._token = token or ""
        self._timeout_seconds = timeout_seconds
        self._transport = transport

    @property
    def enabled(self) -> bool:
        return self._base_url is not None

    def _headers(self) -> dict[str, str]:
        return {"X-Access-Control-Internal-Token": self._token}

    async def _post(self, path: str, payload: dict[str, Any]) -> httpx.Response:
        if self._base_url is None:
            raise RuntimeError("Run policy client is disabled")
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds,
                transport=self._transport,
            ) as client:
                return await client.post(
                    f"{self._base_url}{path}",
                    json=payload,
                    headers=self._headers(),
                )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail="Run policy service unavailable") from exc

    async def admit(
        self,
        *,
        body: Any,
        thread_id: str,
        user: Any,
    ) -> RunAdmission:
        if not self.enabled:
            return RunAdmission()
        request_kind = classify_run_request(body)
        if request_kind == "scheduled":
            return RunAdmission()
        admission_id = str(uuid.uuid4())
        response = await self._post(
            "/internal/v1/run-admissions",
            {
                "admission_id": admission_id,
                "user_id": str(getattr(user, "id", "")),
                "user_role": str(getattr(user, "system_role", "user")),
                "user_email": str(getattr(user, "email", "")),
                "thread_id": thread_id,
                "assistant_id": getattr(body, "assistant_id", None),
                "request_kind": request_kind,
            },
        )
        if response.status_code >= 500:
            raise HTTPException(status_code=503, detail="Run policy service unavailable")
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail="Run policy rejected request")
        data = response.json()
        if not data.get("allowed"):
            raise HTTPException(
                status_code=429,
                detail={
                    "code": data.get("reason") or "run_policy_denied",
                    "message": "问答额度已用完，请联系管理员"
                    if data.get("reason") == "quota_exhausted"
                    else "当前账号不可发起问答",
                    "limit": data.get("limit"),
                    "consumed": data.get("consumed", 0),
                    "reserved": data.get("reserved", 0),
                    "remaining": data.get("remaining", 0),
                    "reset_at": data.get("reset_at"),
                },
            )
        return RunAdmission(admission_id=str(data.get("admission_id") or admission_id))

    async def bind(self, admission: RunAdmission, run_id: str) -> None:
        if not admission.reserved:
            return
        response = await self._post(
            "/internal/v1/run-admissions/bind",
            {"admission_id": admission.admission_id, "run_id": run_id},
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=503, detail="Run policy reservation could not be bound")

    async def release(self, admission: RunAdmission, *, reason: str) -> None:
        if not admission.reserved:
            return
        try:
            response = await self._post(
                "/internal/v1/run-admissions/release",
                {"admission_id": admission.admission_id, "reason": reason},
            )
            if response.status_code >= 400:
                logger.warning("Run policy release failed for admission %s", admission.admission_id)
        except HTTPException:
            logger.warning("Run policy release request failed for admission %s", admission.admission_id, exc_info=True)

    async def complete(self, record: RunRecord) -> None:
        if not self.enabled:
            return
        payload = {
            "run_id": record.run_id,
            "status": record.status.value,
            # A successful top-level run is the durable response boundary. It
            # counts once regardless of internal retries, tool calls, goals, or
            # subagents; regenerate is admitted as its own top-level run.
            "has_response": record.status == RunStatus.success and bool(record.last_ai_message),
            "total_tokens": record.total_tokens,
        }
        for attempt in range(3):
            try:
                response = await self._post("/internal/v1/run-outcomes", payload)
                if response.status_code < 500:
                    return
            except HTTPException:
                pass
            if attempt < 2:
                await asyncio.sleep(0.2 * (attempt + 1))
        logger.warning("Run policy completion settlement failed for run %s", record.run_id)


@lru_cache(maxsize=1)
def get_run_policy_client() -> RemoteRunPolicyClient:
    return RemoteRunPolicyClient(
        os.getenv("DEER_FLOW_RUN_POLICY_URL"),
        os.getenv("DEER_FLOW_RUN_POLICY_TOKEN"),
        timeout_seconds=float(os.getenv("DEER_FLOW_RUN_POLICY_TIMEOUT_SECONDS", "5")),
    )
