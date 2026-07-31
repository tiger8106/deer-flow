"""Middleware for automatic thread title generation."""

import logging
import re
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, NotRequired, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langgraph.config import get_config
from langgraph.constants import TAG_NOSTREAM
from langgraph.runtime import Runtime

from deerflow.agents.middlewares.dynamic_context_middleware import is_dynamic_context_reminder
from deerflow.config.title_config import get_title_config
from deerflow.models import create_chat_model
from deerflow.utils.messages import get_original_user_content_text

if TYPE_CHECKING:
    from deerflow.config.app_config import AppConfig
    from deerflow.config.title_config import TitleConfig

logger = logging.getLogger(__name__)

_UPLOAD_BLOCK_RE = re.compile(r"<uploaded_files>[\s\S]*?</uploaded_files>\s*", re.IGNORECASE)
_IMAGE_EXTENSIONS = frozenset({".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"})
_IMAGE_CONTENT_TYPES = frozenset({"image", "image_url", "input_image"})


class TitleMiddlewareState(AgentState):
    """Compatible with the `ThreadState` schema."""

    title: NotRequired[str | None]


class TitleMiddleware(AgentMiddleware[TitleMiddlewareState]):
    """Automatically generate a title for the thread after the first user message."""

    state_schema = TitleMiddlewareState

    def __init__(self, *, app_config: "AppConfig | None" = None, title_config: "TitleConfig | None" = None):
        super().__init__()
        self._app_config = app_config
        self._title_config = title_config

    def _get_title_config(self):
        if self._title_config is not None:
            return self._title_config
        if self._app_config is not None:
            return self._app_config.title
        return get_title_config()

    def _normalize_content(self, content: object) -> str:
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts = [self._normalize_content(item) for item in content]
            return "\n".join(part for part in parts if part)

        if isinstance(content, dict):
            text_value = content.get("text")
            if isinstance(text_value, str):
                return text_value

            nested_content = content.get("content")
            if nested_content is not None:
                return self._normalize_content(nested_content)

        return ""

    @staticmethod
    def _message_type(message: object) -> str | None:
        message_type = getattr(message, "type", None)
        if message_type is None and isinstance(message, dict):
            message_type = message.get("type") or message.get("role")
        if message_type == "user":
            return "human"
        if message_type == "assistant":
            return "ai"
        return message_type if isinstance(message_type, str) else None

    @staticmethod
    def _message_content(message: object) -> object:
        if isinstance(message, dict):
            return message.get("content", "")
        return getattr(message, "content", "")

    @staticmethod
    def _message_additional_kwargs(message: object) -> Mapping[str, Any]:
        if isinstance(message, dict):
            additional_kwargs = message.get("additional_kwargs")
        else:
            additional_kwargs = getattr(message, "additional_kwargs", None)
        return additional_kwargs if isinstance(additional_kwargs, Mapping) else {}

    @staticmethod
    def _message_tool_calls(message: object) -> object:
        if isinstance(message, dict):
            tool_calls = message.get("tool_calls")
        else:
            tool_calls = getattr(message, "tool_calls", None)
        if tool_calls:
            return tool_calls
        return TitleMiddleware._message_additional_kwargs(message).get("tool_calls")

    @staticmethod
    def _is_dynamic_context_reminder_message(message: object) -> bool:
        if is_dynamic_context_reminder(message):
            return True
        if isinstance(message, dict):
            additional_kwargs = message.get("additional_kwargs")
            return isinstance(additional_kwargs, dict) and bool(additional_kwargs.get("dynamic_context_reminder"))
        return False

    @staticmethod
    def _is_user_message_for_title(message: object) -> bool:
        return TitleMiddleware._message_type(message) == "human" and not TitleMiddleware._is_dynamic_context_reminder_message(message)

    def _get_title_user_message(self, state: TitleMiddlewareState) -> str:
        messages = state.get("messages") or []
        user_message = next((m for m in messages if self._is_user_message_for_title(m)), None)
        if user_message is None:
            return ""

        # UploadsMiddleware preserves the pre-injection text in
        # ``original_user_content``. Prefer it so internal upload instructions
        # never become a visible thread title. The regex remains as a backwards-
        # compatible fallback for checkpoints created before that marker existed.
        user_msg = get_original_user_content_text(
            self._message_content(user_message),
            self._message_additional_kwargs(user_message),
        )
        return _UPLOAD_BLOCK_RE.sub("", user_msg).strip()

    def _get_title_assistant_message(self, state: TitleMiddlewareState) -> str:
        """Return the latest completed assistant answer, excluding tool-call turns."""
        messages = state.get("messages") or []
        for message in reversed(messages):
            if self._message_type(message) != "ai" or self._message_tool_calls(message):
                continue
            content = self._strip_think_tags(self._normalize_content(self._message_content(message)))
            if content:
                return content
        return ""

    def _has_image_upload(self, state: TitleMiddlewareState) -> bool:
        """Detect image attachments without depending on frontend-only metadata."""
        messages = state.get("messages") or []
        user_message = next((m for m in messages if self._is_user_message_for_title(m)), None)
        if user_message is None:
            return False

        files = self._message_additional_kwargs(user_message).get("files")
        if isinstance(files, list):
            for file in files:
                if not isinstance(file, Mapping):
                    continue
                filename = file.get("filename") or file.get("name")
                if isinstance(filename, str) and any(filename.lower().endswith(extension) for extension in _IMAGE_EXTENSIONS):
                    return True
                mime_type = file.get("mime_type") or file.get("type")
                if isinstance(mime_type, str) and mime_type.lower().startswith("image/"):
                    return True

        content = self._message_content(user_message)
        if isinstance(content, list):
            for block in content:
                if isinstance(block, Mapping) and block.get("type") in _IMAGE_CONTENT_TYPES:
                    return True

        upload_block = _UPLOAD_BLOCK_RE.search(self._normalize_content(content))
        return bool(
            upload_block
            and re.search(
                r"\.(?:bmp|gif|jpe?g|png|tiff?|webp)(?:\b|$)",
                upload_block.group(0),
                flags=re.IGNORECASE,
            )
        )

    def _image_fallback_title(self, state: TitleMiddlewareState, user_msg: str) -> str:
        """Keep both the question and extracted image information in a local fallback."""
        assistant_msg = self._get_title_assistant_message(state)
        if not assistant_msg:
            return self._fallback_title(user_msg)

        # The title model normally produces the semantic summary. If that call
        # is unavailable, use the first meaningful answer line and reserve space
        # for both sides instead of falling back to an upload protocol string.
        answer_line = next((line.strip() for line in assistant_msg.splitlines() if line.strip()), "")
        answer_line = re.sub(r"^[#>*+\-\d.\s]+", "", answer_line)
        answer_line = re.sub(r"[*_`]+", "", answer_line).strip()

        config = self._get_title_config()
        limit = min(config.max_chars, 50)
        separator = " · "
        if not user_msg:
            return self._fallback_title(answer_line)
        if not answer_line or limit <= len(separator) + 2:
            return self._fallback_title(user_msg)

        user_limit = max(1, min(len(user_msg), limit // 2))
        answer_limit = max(1, limit - len(separator) - user_limit)
        user_part = user_msg[:user_limit].rstrip()
        answer_part = answer_line[:answer_limit].rstrip()
        return f"{user_part}{separator}{answer_part}"

    def _should_generate_title(self, state: TitleMiddlewareState, *, allow_partial_exchange: bool = False) -> bool:
        """Check if we should generate a title for this thread."""
        config = self._get_title_config()
        if not config.enabled:
            return False

        # Check if thread already has a title in state
        if state.get("title"):
            return False

        # Check if this is the first turn (has at least one user message and one assistant response).
        # Defensively coerce a None ``messages`` channel (possible when reading a
        # partially-initialized checkpoint) into an empty list so ``len()`` is safe.
        messages = state.get("messages") or []
        min_messages = 1 if allow_partial_exchange else 2
        if len(messages) < min_messages:
            return False

        # Count user and assistant messages
        user_messages = [m for m in messages if self._is_user_message_for_title(m)]
        assistant_messages = [m for m in messages if self._message_type(m) == "ai" and not self._message_tool_calls(m) and self._strip_think_tags(self._normalize_content(self._message_content(m)))]

        # Normal path: title only after first complete exchange. Interrupted path
        # (``allow_partial_exchange=True``) accepts a lone first-turn user message
        # so a fallback title can still be persisted when the run is cancelled
        # before any AI chunk reaches the checkpoint.
        return len(user_messages) == 1 and (len(assistant_messages) >= 1 or allow_partial_exchange)

    def _build_title_prompt(self, state: TitleMiddlewareState) -> tuple[str, str]:
        """Extract user/assistant messages and build the title prompt.

        Returns (prompt_string, user_msg) so callers can use user_msg as fallback.
        """
        config = self._get_title_config()
        user_msg = self._get_title_user_message(state)
        assistant_msg = self._get_title_assistant_message(state)

        prompt = config.prompt_template.format(
            max_words=config.max_words,
            user_msg=user_msg[:500],
            assistant_msg=assistant_msg[:500],
        )
        if self._has_image_upload(state):
            prompt = (
                "An image was uploaded. Summarize both the concrete information extracted from the image "
                "in the assistant answer and the user's question or intent. Never include upload metadata, "
                "file paths, or internal tags in the title.\n\n"
                f"{prompt}"
            )
        return prompt, user_msg

    def _strip_think_tags(self, text: str) -> str:
        """Remove <think>...</think> blocks emitted by reasoning models (e.g. minimax, DeepSeek-R1)."""
        return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()

    def _parse_title(self, content: object) -> str:
        """Normalize model output into a clean title string."""
        config = self._get_title_config()
        title_content = self._normalize_content(content)
        title_content = self._strip_think_tags(title_content)
        title = title_content.strip().strip('"').strip("'")
        return title[: config.max_chars] if len(title) > config.max_chars else title

    def _fallback_title(self, user_msg: str) -> str:
        config = self._get_title_config()
        fallback_chars = min(config.max_chars, 50)
        if len(user_msg) > fallback_chars:
            # Reserve room for the ellipsis so this path honours ``max_chars``
            # exactly as ``_parse_title`` does on the model path.
            ellipsis = "..."
            body = min(fallback_chars, config.max_chars - len(ellipsis))
            return user_msg[:body].rstrip() + ellipsis
        return user_msg if user_msg else "New Conversation"

    def _get_runnable_config(self) -> dict[str, Any]:
        """Inherit the parent RunnableConfig and add middleware tag.

        This ensures RunJournal identifies LLM calls from this middleware
        as ``middleware:title`` instead of ``lead_agent``.
        """
        try:
            parent = get_config()
        except Exception:
            parent = {}
        config = {**parent}
        config["run_name"] = "title_agent"
        config["tags"] = [
            *(config.get("tags") or []),
            "middleware:title",
            TAG_NOSTREAM,
        ]
        return config

    def _generate_title_result(self, state: TitleMiddlewareState, *, allow_partial_exchange: bool = False) -> dict | None:
        """Generate a local fallback title without blocking on an LLM call."""
        if not self._should_generate_title(state, allow_partial_exchange=allow_partial_exchange):
            return None

        user_msg = self._get_title_user_message(state)
        if self._has_image_upload(state) and not allow_partial_exchange:
            return {"title": self._image_fallback_title(state, user_msg)}
        return {"title": self._fallback_title(user_msg)}

    async def _agenerate_title_result(self, state: TitleMiddlewareState) -> dict | None:
        """Generate a configured LLM title asynchronously and fall back locally."""
        if not self._should_generate_title(state):
            return None

        config = self._get_title_config()
        has_image_upload = self._has_image_upload(state)
        if not config.model_name and not has_image_upload:
            user_msg = self._get_title_user_message(state)
            return {"title": self._fallback_title(user_msg)}

        user_msg = self._get_title_user_message(state)

        try:
            prompt, user_msg = self._build_title_prompt(state)
            # attach_tracing=False because ``_get_runnable_config()`` inherits
            # the graph-level RunnableConfig (set in ``_make_lead_agent``) whose
            # callbacks already carry tracing handlers; binding them again at
            # the model level would emit duplicate spans.
            model_kwargs = {"thinking_enabled": False, "attach_tracing": False}
            if self._app_config is not None:
                model_kwargs["app_config"] = self._app_config
            model = create_chat_model(name=config.model_name, **model_kwargs)
            response = await model.ainvoke(prompt, config=self._get_runnable_config())
            title = self._parse_title(response.content)
            if title:
                return {"title": title}
        except Exception:
            logger.debug("Failed to generate async title; falling back to local title", exc_info=True)
        if has_image_upload:
            return {"title": self._image_fallback_title(state, user_msg)}
        return {"title": self._fallback_title(user_msg)}

    @override
    def after_model(self, state: TitleMiddlewareState, runtime: Runtime) -> dict | None:
        return self._generate_title_result(state)

    @override
    async def aafter_model(self, state: TitleMiddlewareState, runtime: Runtime) -> dict | None:
        return await self._agenerate_title_result(state)
