"""Core behavior tests for TitleMiddleware."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.constants import TAG_NOSTREAM

from deerflow.agents.middlewares import title_middleware as title_middleware_module
from deerflow.agents.middlewares.dynamic_context_middleware import _DYNAMIC_CONTEXT_REMINDER_KEY
from deerflow.agents.middlewares.title_middleware import TitleMiddleware
from deerflow.config.title_config import TitleConfig, get_title_config, set_title_config
from deerflow.utils.messages import ORIGINAL_USER_CONTENT_KEY


def _clone_title_config(config: TitleConfig) -> TitleConfig:
    # Avoid mutating shared global config objects across tests.
    return TitleConfig(**config.model_dump())


def _set_test_title_config(**overrides) -> TitleConfig:
    config = _clone_title_config(get_title_config())
    for key, value in overrides.items():
        setattr(config, key, value)
    set_title_config(config)
    return config


class TestTitleMiddlewareCoreLogic:
    def setup_method(self):
        # Title config is a global singleton; snapshot and restore for test isolation.
        self._original = _clone_title_config(get_title_config())

    def teardown_method(self):
        set_title_config(self._original)

    def test_should_generate_title_for_first_complete_exchange(self):
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                HumanMessage(content="帮我总结这段代码"),
                AIMessage(content="好的，我先看结构"),
            ]
        }

        assert middleware._should_generate_title(state) is True

    def test_should_generate_title_with_dynamic_context_reminder(self):
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                HumanMessage(
                    content="<system-reminder>\n<memory>User prefers Python.</memory>\n</system-reminder>",
                    additional_kwargs={_DYNAMIC_CONTEXT_REMINDER_KEY: True},
                ),
                HumanMessage(content="帮我总结这段代码"),
                AIMessage(content="好的，我先看结构"),
            ]
        }

        assert middleware._should_generate_title(state) is True

    def test_should_not_generate_title_when_disabled_or_already_set(self):
        middleware = TitleMiddleware()

        _set_test_title_config(enabled=False)
        disabled_state = {
            "messages": [HumanMessage(content="Q"), AIMessage(content="A")],
            "title": None,
        }
        assert middleware._should_generate_title(disabled_state) is False

        _set_test_title_config(enabled=True)
        titled_state = {
            "messages": [HumanMessage(content="Q"), AIMessage(content="A")],
            "title": "Existing Title",
        }
        assert middleware._should_generate_title(titled_state) is False

    def test_should_not_generate_title_after_second_user_turn(self):
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                HumanMessage(content="第一问"),
                AIMessage(content="第一答"),
                HumanMessage(content="第二问"),
                AIMessage(content="第二答"),
            ]
        }

        assert middleware._should_generate_title(state) is False

    def test_should_wait_for_final_answer_after_image_tool_call(self):
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        user_message = HumanMessage(
            content="<uploaded_files>\n- screenshot.png\n</uploaded_files>\n\n图中是什么界面？",
            additional_kwargs={
                "files": [{"filename": "screenshot.png"}],
                ORIGINAL_USER_CONTENT_KEY: "图中是什么界面？",
            },
        )
        tool_call_message = AIMessage(
            content="",
            tool_calls=[{"name": "view_image", "args": {"image_path": "screenshot.png"}, "id": "call-1"}],
        )

        assert middleware._should_generate_title({"messages": [user_message, tool_call_message]}) is False
        assert (
            middleware._should_generate_title(
                {
                    "messages": [
                        user_message,
                        tool_call_message,
                        AIMessage(content="图中展示的是角色授权管理界面。"),
                    ]
                }
            )
            is True
        )

    def test_generate_title_uses_async_model_and_respects_max_chars(self, monkeypatch):
        _set_test_title_config(max_chars=12, model_name="title-model")
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content="短标题"))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))

        state = {
            "messages": [
                HumanMessage(content="请帮我写一个很长很长的脚本标题"),
                AIMessage(content="好的，先确认需求"),
            ]
        }
        result = asyncio.run(middleware._agenerate_title_result(state))
        title = result["title"]

        assert title == "短标题"
        title_middleware_module.create_chat_model.assert_called_once_with(name="title-model", thinking_enabled=False, attach_tracing=False)
        model.ainvoke.assert_awaited_once()
        assert model.ainvoke.await_args.kwargs["config"] == {
            "run_name": "title_agent",
            "tags": ["middleware:title", TAG_NOSTREAM],
        }

    def test_title_model_config_preserves_parent_tags_and_adds_nostream(self, monkeypatch):
        middleware = TitleMiddleware()
        monkeypatch.setattr(
            title_middleware_module,
            "get_config",
            MagicMock(return_value={"tags": ["parent"]}),
        )

        config = middleware._get_runnable_config()

        assert config["run_name"] == "title_agent"
        assert config["tags"] == ["parent", "middleware:title", TAG_NOSTREAM]

    def test_generate_title_uses_explicit_app_config_without_global_config(self, monkeypatch):
        title_config = TitleConfig(enabled=True, model_name="title-model", max_chars=20)
        app_config = SimpleNamespace(title=title_config)
        middleware = TitleMiddleware(app_config=app_config)
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content="显式标题"))

        def fail_get_title_config():
            raise AssertionError("ambient get_title_config() must not be used when app_config is explicit")

        monkeypatch.setattr(title_middleware_module, "get_title_config", fail_get_title_config)
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))

        state = {
            "messages": [
                HumanMessage(content="请帮我写一个标题"),
                AIMessage(content="好的"),
            ]
        }
        result = asyncio.run(middleware._agenerate_title_result(state))

        assert result == {"title": "显式标题"}
        title_middleware_module.create_chat_model.assert_called_once_with(
            name="title-model",
            thinking_enabled=False,
            attach_tracing=False,
            app_config=app_config,
        )

    def test_generate_title_normalizes_structured_message_content(self, monkeypatch):
        _set_test_title_config(max_chars=20, model_name="title-model")
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content="请帮我总结这段代码"))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))

        state = {
            "messages": [
                HumanMessage(content=[{"type": "text", "text": "请帮我总结这段代码"}]),
                AIMessage(content=[{"type": "text", "text": "好的，先看结构"}]),
            ]
        }

        result = asyncio.run(middleware._agenerate_title_result(state))
        title = result["title"]

        assert title == "请帮我总结这段代码"

    @pytest.mark.parametrize(
        ("title_locale", "user_message", "model_title", "language_marker"),
        [
            ("zh-CN", "Please summarize this code", "代码摘要", "简体中文"),
            ("en-US", "请总结这段代码", "Code summary", "in English"),
        ],
    )
    def test_title_model_follows_ui_locale(self, monkeypatch, title_locale, user_message, model_title, language_marker):
        _set_test_title_config(max_chars=30, model_name="title-model")
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content=model_title))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))

        state = {
            "messages": [
                HumanMessage(content=user_message),
                AIMessage(content="回答内容" if title_locale == "zh-CN" else "Answer content"),
            ]
        }

        result = asyncio.run(middleware._agenerate_title_result(state, title_locale=title_locale))

        assert result == {"title": model_title}
        prompt = model.ainvoke.await_args.args[0]
        assert language_marker in prompt

    @pytest.mark.parametrize(
        ("title_locale", "model_title", "fallback_title"),
        [
            ("zh-CN", "English title", "用户问题"),
            ("en-US", "中文标题", "User question"),
        ],
    )
    def test_wrong_language_model_title_falls_back_to_selected_locale(self, monkeypatch, title_locale, model_title, fallback_title):
        _set_test_title_config(max_chars=30, model_name="title-model")
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content=model_title))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))

        state = {
            "messages": [
                HumanMessage(content="用户问题" if title_locale == "zh-CN" else "User question"),
                AIMessage(content="助手回答" if title_locale == "zh-CN" else "Assistant answer"),
            ]
        }

        result = asyncio.run(middleware._agenerate_title_result(state, title_locale=title_locale))

        assert result == {"title": fallback_title}

    def test_image_title_model_failure_uses_selected_locale(self, monkeypatch):
        _set_test_title_config(max_chars=40, model_name=None)
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(side_effect=RuntimeError("model unavailable"))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))
        state = {
            "messages": [
                HumanMessage(
                    content=[{"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}}],
                    additional_kwargs={"files": [{"filename": "photo.png"}]},
                ),
                AIMessage(content="图片中有一只猫。"),
            ]
        }

        chinese_result = asyncio.run(middleware._agenerate_title_result(state, title_locale="zh-CN"))
        english_result = asyncio.run(middleware._agenerate_title_result(state, title_locale="en-US"))

        assert chinese_result == {"title": "图片中有一只猫。"}
        assert english_result == {"title": "Image inquiry"}

    @pytest.mark.parametrize(
        ("title_locale", "user_message", "expected_title"),
        [
            ("zh-CN", "Please summarize this code", "新建会话"),
            ("en-US", "请总结这段代码", "New Conversation"),
        ],
    )
    def test_local_fallback_does_not_return_opposite_language(self, title_locale, user_message, expected_title):
        _set_test_title_config(max_chars=30, model_name=None)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                HumanMessage(content=user_message),
                AIMessage(content="Answer"),
            ]
        }

        result = middleware._generate_title_result(state, title_locale=title_locale)

        assert result == {"title": expected_title}

    @pytest.mark.parametrize(
        ("title_locale", "user_message", "model_title"),
        [
            ("zh-CN", "Please summarize this code", "代码摘要"),
            ("en-US", "请总结这段代码", "Code summary"),
        ],
    )
    def test_locale_mismatch_uses_default_model_when_no_title_model_is_configured(
        self,
        monkeypatch,
        title_locale,
        user_message,
        model_title,
    ):
        _set_test_title_config(max_chars=30, model_name=None)
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content=model_title))
        create_chat_model = MagicMock(return_value=model)
        monkeypatch.setattr(title_middleware_module, "create_chat_model", create_chat_model)
        state = {
            "messages": [
                HumanMessage(content=user_message),
                AIMessage(content="回答内容" if title_locale == "zh-CN" else "Answer content"),
            ]
        }

        result = asyncio.run(middleware._agenerate_title_result(state, title_locale=title_locale))

        assert result == {"title": model_title}
        create_chat_model.assert_called_once_with(name=None, thinking_enabled=False, attach_tracing=False)

    def test_runtime_locale_is_forwarded_to_title_generation(self, monkeypatch):
        _set_test_title_config(model_name="title-model")
        middleware = TitleMiddleware()
        generate = AsyncMock(return_value={"title": "English title"})
        monkeypatch.setattr(middleware, "_agenerate_title_result", generate)
        state = {"messages": []}

        result = asyncio.run(
            middleware.aafter_model(
                state,
                runtime=SimpleNamespace(context={"title_locale": "en-US"}),
            )
        )

        assert result == {"title": "English title"}
        generate.assert_awaited_once_with(state, title_locale="en-US")

    def test_image_upload_uses_default_model_with_clean_question_and_final_answer(self, monkeypatch):
        _set_test_title_config(max_chars=30, model_name=None)
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content="角色授权窄屏布局优化"))
        create_chat_model = MagicMock(return_value=model)
        monkeypatch.setattr(title_middleware_module, "create_chat_model", create_chat_model)

        state = {
            "messages": [
                HumanMessage(
                    content=("<uploaded_files>\nThe following files were uploaded in this message:\n- filename: screenshot.png\n</uploaded_files>\n\n这个界面在窄屏时为什么重叠？"),
                    additional_kwargs={
                        "files": [{"filename": "screenshot.png"}],
                        ORIGINAL_USER_CONTENT_KEY: "这个界面在窄屏时为什么重叠？",
                    },
                ),
                AIMessage(
                    content="",
                    tool_calls=[{"name": "view_image", "args": {"image_path": "screenshot.png"}, "id": "call-1"}],
                ),
                HumanMessage(
                    content=[
                        {"type": "text", "text": "The following image has been viewed:"},
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}},
                    ],
                    additional_kwargs={"hide_from_ui": True},
                ),
                AIMessage(content="图片是角色授权界面，角色列与授权范围列在窄屏下发生重叠。"),
            ]
        }

        result = asyncio.run(middleware._agenerate_title_result(state))

        assert result == {"title": "角色授权窄屏布局优化"}
        create_chat_model.assert_called_once_with(name=None, thinking_enabled=False, attach_tracing=False)
        prompt = model.ainvoke.await_args.args[0]
        assert "这个界面在窄屏时为什么重叠？" in prompt
        assert "图片是角色授权界面" in prompt
        assert "<uploaded_files>" not in prompt
        assert "The following files were uploaded" not in prompt

    def test_non_image_upload_keeps_local_title_and_removes_upload_protocol(self, monkeypatch):
        _set_test_title_config(max_chars=30, model_name=None)
        middleware = TitleMiddleware()
        create_chat_model = MagicMock()
        monkeypatch.setattr(title_middleware_module, "create_chat_model", create_chat_model)
        state = {
            "messages": [
                HumanMessage(
                    content="<uploaded_files>\n- report.pdf\n</uploaded_files>\n\n请总结报告",
                    additional_kwargs={ORIGINAL_USER_CONTENT_KEY: "请总结报告", "files": [{"filename": "report.pdf"}]},
                ),
                AIMessage(content="报告主要介绍年度经营情况。"),
            ]
        }

        result = asyncio.run(middleware._agenerate_title_result(state))

        assert result == {"title": "请总结报告"}
        create_chat_model.assert_not_called()

    def test_image_title_model_failure_falls_back_to_question_and_extracted_information(self, monkeypatch):
        _set_test_title_config(max_chars=40, model_name=None)
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(side_effect=RuntimeError("model unavailable"))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))
        state = {
            "messages": [
                HumanMessage(
                    content="<uploaded_files>\n- chart.jpg\n</uploaded_files>\n\n图中趋势如何？",
                    additional_kwargs={ORIGINAL_USER_CONTENT_KEY: "图中趋势如何？", "files": [{"filename": "chart.jpg"}]},
                ),
                AIMessage(content="图中销售额从一月到六月持续增长。"),
            ]
        }

        result = asyncio.run(middleware._agenerate_title_result(state))

        assert "图中趋势如何" in result["title"]
        assert "销售额" in result["title"]
        assert "<uploaded_files>" not in result["title"]
        assert len(result["title"]) <= 40

    def test_generate_title_fallback_for_long_message(self, monkeypatch):
        _set_test_title_config(max_chars=20, model_name="title-model")
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(side_effect=RuntimeError("model unavailable"))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))

        state = {
            "messages": [
                HumanMessage(content="这是一个非常长的问题描述，需要被截断以形成fallback标题"),
                AIMessage(content="收到"),
            ]
        }
        result = asyncio.run(middleware._agenerate_title_result(state))
        title = result["title"]

        # Assert behavior (truncated fallback + ellipsis) without overfitting exact text.
        assert title.endswith("...")
        assert title.startswith("这是一个非常长的问题描述")

    def test_aafter_model_delegates_to_async_helper(self, monkeypatch):
        _set_test_title_config(model_name="title-model")
        middleware = TitleMiddleware()

        monkeypatch.setattr(middleware, "_agenerate_title_result", AsyncMock(return_value={"title": "异步标题"}))
        result = asyncio.run(middleware.aafter_model({"messages": []}, runtime=MagicMock()))
        assert result == {"title": "异步标题"}

        monkeypatch.setattr(middleware, "_agenerate_title_result", AsyncMock(return_value=None))
        assert asyncio.run(middleware.aafter_model({"messages": []}, runtime=MagicMock())) is None

    def test_aafter_model_uses_local_fallback_when_no_title_model_is_configured(self, monkeypatch):
        """Default async path must not block stream completion on a second LLM call."""
        _set_test_title_config(max_chars=20, model_name=None)
        middleware = TitleMiddleware()
        create_chat_model = MagicMock()
        monkeypatch.setattr(title_middleware_module, "create_chat_model", create_chat_model)

        state = {
            "messages": [
                HumanMessage(content="请帮我写测试"),
                AIMessage(content="好的"),
            ]
        }
        result = asyncio.run(middleware.aafter_model(state, runtime=MagicMock()))

        assert result == {"title": "请帮我写测试"}
        create_chat_model.assert_not_called()

    def test_async_generate_title_result_uses_local_fallback_without_model_name(self, monkeypatch):
        """The default async helper path avoids the hidden title-model LLM call."""
        _set_test_title_config(max_chars=20, model_name=None)
        middleware = TitleMiddleware()
        create_chat_model = MagicMock()
        monkeypatch.setattr(title_middleware_module, "create_chat_model", create_chat_model)

        state = {
            "messages": [
                HumanMessage(content="流式回答结束后不要再等待标题模型"),
                AIMessage(content="好的"),
            ]
        }
        result = asyncio.run(middleware._agenerate_title_result(state))

        assert result == {"title": "流式回答结束后不要再等待标题模型"}
        create_chat_model.assert_not_called()

    def test_async_local_fallback_does_not_format_unused_prompt_template(self, monkeypatch):
        """Local fallback should not depend on the LLM prompt template."""
        _set_test_title_config(max_chars=20, model_name=None, prompt_template="{missing_placeholder}")
        middleware = TitleMiddleware()
        create_chat_model = MagicMock()
        monkeypatch.setattr(title_middleware_module, "create_chat_model", create_chat_model)

        state = {
            "messages": [
                HumanMessage(content="默认标题路径不应读取模型 prompt"),
                AIMessage(content="好的"),
            ]
        }
        result = asyncio.run(middleware._agenerate_title_result(state))

        assert result == {"title": "默认标题路径不应读取模型 prompt"}
        create_chat_model.assert_not_called()

    def test_async_title_model_falls_back_when_prompt_template_is_invalid(self, monkeypatch):
        """Opt-in LLM title generation still degrades locally on template errors."""
        _set_test_title_config(max_chars=20, model_name="title-model", prompt_template="{usr_msg}")
        middleware = TitleMiddleware()
        create_chat_model = MagicMock()
        monkeypatch.setattr(title_middleware_module, "create_chat_model", create_chat_model)

        state = {
            "messages": [
                HumanMessage(content="请帮我写测试"),
                AIMessage(content="好的"),
            ]
        }
        result = asyncio.run(middleware._agenerate_title_result(state))

        assert result == {"title": "请帮我写测试"}
        create_chat_model.assert_not_called()

    def test_after_model_sync_delegates_to_sync_helper(self, monkeypatch):
        middleware = TitleMiddleware()

        monkeypatch.setattr(middleware, "_generate_title_result", MagicMock(return_value={"title": "同步标题"}))
        result = middleware.after_model({"messages": []}, runtime=MagicMock())
        assert result == {"title": "同步标题"}

        monkeypatch.setattr(middleware, "_generate_title_result", MagicMock(return_value=None))
        assert middleware.after_model({"messages": []}, runtime=MagicMock()) is None

    def test_sync_generate_title_uses_fallback_without_model(self):
        """Sync path avoids LLM calls and derives a local fallback title."""
        _set_test_title_config(max_chars=20)
        middleware = TitleMiddleware()

        state = {
            "messages": [
                HumanMessage(content="请帮我写测试"),
                AIMessage(content="好的"),
            ]
        }
        result = middleware._generate_title_result(state)
        assert result == {"title": "请帮我写测试"}

    def test_sync_generate_title_respects_fallback_truncation(self):
        """Sync fallback path still respects max_chars truncation rules."""
        _set_test_title_config(max_chars=50)
        middleware = TitleMiddleware()

        state = {
            "messages": [
                HumanMessage(content="这是一个非常长的问题描述，需要被截断以形成fallback标题，而且这里继续补充更多上下文，确保超过本地fallback截断阈值"),
                AIMessage(content="回复"),
            ]
        }
        result = middleware._generate_title_result(state)
        assert result["title"].endswith("...")
        assert result["title"].startswith("这是一个非常长的问题描述")
        assert len(result["title"]) <= 50

    @pytest.mark.parametrize("max_chars", [10, 20, 40, 49, 50, 52, 53, 60, 200])
    def test_fallback_title_never_exceeds_max_chars(self, max_chars):
        """``max_chars`` bounds the fallback title, not just its body.

        The ellipsis is part of the returned title, so a body of exactly
        ``min(max_chars, 50)`` characters overshot the configured cap by three.
        ``model_name: null`` is the shipped default, so this is the path every
        title takes out of the box -- not an error branch.
        """
        _set_test_title_config(max_chars=max_chars, model_name=None)
        middleware = TitleMiddleware()

        title = middleware._fallback_title("x" * 200)

        assert len(title) <= max_chars
        assert title.endswith("...")

    @pytest.mark.parametrize("max_chars", [10, 20, 50])
    def test_fallback_title_honours_the_same_cap_as_the_model_path(self, max_chars):
        """Both title paths read ``config.max_chars``; both must respect it.

        ``_parse_title`` slices the model's answer to ``max_chars`` exactly. The
        local path is the other half of the same contract.
        """
        _set_test_title_config(max_chars=max_chars, model_name=None)
        middleware = TitleMiddleware()
        long_text = "x" * 200

        assert len(middleware._parse_title(long_text)) <= max_chars
        assert len(middleware._fallback_title(long_text)) <= max_chars

    def test_fallback_title_keeps_default_config_output_unchanged(self):
        """The default ``max_chars=60`` leaves room for the ellipsis already.

        Reserving that room must not shorten titles that were never over the
        cap, so the shipped configuration keeps emitting a 50-character body.
        """
        _set_test_title_config(max_chars=60, model_name=None)
        middleware = TitleMiddleware()

        title = middleware._fallback_title("x" * 200)

        assert title == "x" * 50 + "..."

    def test_parse_title_strips_think_tags(self):
        """Title model responses with <think>...</think> blocks are stripped before use."""
        middleware = TitleMiddleware()
        raw = "<think>用户想要研究贵阳发展情况。我需要使用 deep-research skill。</think>贵阳近5年发展报告研究"
        result = middleware._parse_title(raw)
        assert "<think>" not in result
        assert result == "贵阳近5年发展报告研究"

    def test_parse_title_strips_think_tags_only_response(self):
        """If model only outputs a think block and nothing else, title is empty string."""
        middleware = TitleMiddleware()
        raw = "<think>just thinking, no real title</think>"
        result = middleware._parse_title(raw)
        assert result == ""

    def test_build_title_prompt_strips_assistant_think_tags(self):
        """<think> blocks in assistant messages are stripped before being included in the title prompt."""
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                HumanMessage(content="贵阳发展报告研究"),
                AIMessage(content="<think>分析用户需求</think>我将为您研究贵阳的发展情况。"),
            ]
        }
        prompt, _ = middleware._build_title_prompt(state)
        assert "<think>" not in prompt

    def test_build_title_prompt_uses_real_user_message_with_dynamic_context_reminder(self):
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                HumanMessage(
                    content="<system-reminder>\n<memory>User prefers Python.</memory>\n</system-reminder>",
                    additional_kwargs={_DYNAMIC_CONTEXT_REMINDER_KEY: True},
                ),
                HumanMessage(content="请帮我写测试"),
                AIMessage(content="好的"),
            ]
        }

        prompt, user_msg = middleware._build_title_prompt(state)
        assert user_msg == "请帮我写测试"
        assert "<system-reminder>" not in prompt
        assert "User prefers Python" not in prompt

    def test_get_title_user_message_strips_upload_block_without_original_marker(self):
        middleware = TitleMiddleware()
        state = {
            "messages": [
                HumanMessage(content="<uploaded_files>\n- legacy.png\n</uploaded_files>\n\n请说明图中内容"),
                AIMessage(content="图中是一个知识库界面。"),
            ]
        }

        assert middleware._get_title_user_message(state) == "请说明图中内容"

    def test_should_generate_title_partial_exchange_allows_user_only(self):
        """Interrupted-run path can produce a fallback from a lone human message."""
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {"messages": [HumanMessage(content="只有人类消息，AI 还没回复")]}

        assert middleware._should_generate_title(state) is False
        assert middleware._should_generate_title(state, allow_partial_exchange=True) is True

    def test_should_generate_title_partial_exchange_skips_when_titled(self):
        """Existing title still wins, even on the interrupted-run path."""
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [HumanMessage(content="问题")],
            "title": "Already set",
        }
        assert middleware._should_generate_title(state, allow_partial_exchange=True) is False

    def test_should_generate_title_handles_dict_messages(self):
        """Checkpoint channel_values store messages as dicts; the middleware must accept them."""
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                {"type": "human", "content": "问"},
                {"type": "ai", "content": "答"},
            ]
        }
        assert middleware._should_generate_title(state) is True

    def test_sync_generate_title_from_dict_messages(self):
        """Sync fallback path can derive title text from dict-form messages."""
        _set_test_title_config(max_chars=20)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                {"role": "user", "content": "请帮我写测试"},
                {"role": "assistant", "content": "好的"},
            ]
        }
        assert middleware._generate_title_result(state) == {"title": "请帮我写测试"}

    def test_should_generate_title_handles_none_messages_channel(self):
        """A checkpoint with ``messages=None`` (partially-initialized state) must not crash."""
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        # ``messages`` key exists but is None — ``state.get("messages", [])`` would
        # have returned ``None`` (default only applies on missing key), so this
        # exercises the ``or []`` coercion the helper relies on.
        state = {"messages": None}

        assert middleware._should_generate_title(state) is False
        assert middleware._should_generate_title(state, allow_partial_exchange=True) is False

    def test_build_title_prompt_handles_none_messages_channel(self):
        """``_build_title_prompt`` must also tolerate a None messages channel."""
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {"messages": None}

        prompt, user_msg = middleware._build_title_prompt(state)
        assert user_msg == ""
        # Prompt is still well-formed — just empty user/assistant slots.
        assert "{user_msg}" not in prompt  # the template was formatted, not left raw

    def test_should_generate_title_dict_messages_role_normalization(self):
        """Dict-form messages may use either ``type`` or ``role``; both must map correctly."""
        _set_test_title_config(enabled=True)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                # ``role: user`` should be normalized to ``human``
                {"role": "user", "content": "Q"},
                # ``role: assistant`` should be normalized to ``ai``
                {"role": "assistant", "content": "A"},
            ]
        }
        assert middleware._should_generate_title(state) is True

    def test_partial_exchange_with_dict_human_message(self):
        """Interrupted-run path must accept a lone dict-form first-turn user message."""
        _set_test_title_config(enabled=True, max_chars=20)
        middleware = TitleMiddleware()
        state = {"messages": [{"role": "user", "content": "请帮我写测试"}]}

        result = middleware._generate_title_result(state, allow_partial_exchange=True)
        assert result == {"title": "请帮我写测试"}

    def test_partial_exchange_ignores_dict_dynamic_context_reminder(self):
        """Checkpoint dicts can include hidden memory reminders that should not count as real user turns."""
        _set_test_title_config(enabled=True, max_chars=20)
        middleware = TitleMiddleware()
        state = {
            "messages": [
                {
                    "type": "human",
                    "content": "<memory>User prefers concise titles.</memory>",
                    "additional_kwargs": {"hide_from_ui": True, _DYNAMIC_CONTEXT_REMINDER_KEY: True},
                },
                {"type": "human", "content": "请帮我写测试", "additional_kwargs": {}},
            ]
        }

        assert middleware._should_generate_title(state, allow_partial_exchange=True) is True
        assert middleware._generate_title_result(state, allow_partial_exchange=True) == {"title": "请帮我写测试"}

    def test_generate_title_async_strips_think_tags_in_response(self, monkeypatch):
        """Async title generation strips <think> blocks from the model response."""
        _set_test_title_config(max_chars=50, model_name="title-model")
        middleware = TitleMiddleware()
        model = MagicMock()
        model.ainvoke = AsyncMock(return_value=AIMessage(content="<think>用户想研究贵阳。</think>贵阳发展研究"))
        monkeypatch.setattr(title_middleware_module, "create_chat_model", MagicMock(return_value=model))

        state = {
            "messages": [
                HumanMessage(content="请帮我研究贵阳近5年发展情况"),
                AIMessage(content="好的"),
            ]
        }
        result = asyncio.run(middleware._agenerate_title_result(state))
        assert result is not None
        assert "<think>" not in result["title"]
        assert result["title"] == "贵阳发展研究"
