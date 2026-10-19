"""Titles describe completed work using bounded, descriptive evidence."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from deerflow.agents.middlewares import title_middleware as module
from deerflow.agents.middlewares.title_middleware import TitleMiddleware
from deerflow.config.title_config import TitleConfig


def test_default_title_uses_generated_content(monkeypatch):
    model = MagicMock(ainvoke=AsyncMock(return_value=AIMessage("年度经营情况分析")))
    monkeypatch.setattr(module, "create_chat_model", MagicMock(return_value=model))
    middleware = TitleMiddleware(title_config=TitleConfig())
    state = {"messages": [HumanMessage("总结一下"), AIMessage("报告主要介绍年度经营情况。")]}
    assert asyncio.run(middleware._agenerate_title_result(state, "zh-CN")) == {"title": "年度经营情况分析"}
    assert "年度经营情况" in model.ainvoke.await_args.args[0]


@pytest.mark.parametrize("serialized", [False, True])
def test_artifact_metadata_supplies_image_content_without_raw_tool_payload(monkeypatch, serialized):
    model = MagicMock(ainvoke=AsyncMock(return_value=AIMessage("智慧园区能源管理架构")))
    monkeypatch.setattr(module, "create_chat_model", MagicMock(return_value=model))
    messages = [
        HumanMessage("把图片转成PPT", additional_kwargs={"files": [{"filename": "input.png"}]}),
        ToolMessage(
            "raw-secret-payload",
            tool_call_id="delivery",
            additional_kwargs={
                "artifact_metadata": {"title": "智慧园区能源管理架构", "description": "采集、分析与控制", "path": "/private/internal.pptx"},
            },
        ),
        AIMessage("已生成，请下载。"),
    ]
    state = {"messages": [m.model_dump() for m in messages] if serialized else messages}
    middleware = TitleMiddleware(title_config=TitleConfig())
    assert asyncio.run(middleware._agenerate_title_result(state, "zh-CN"))["title"] == "智慧园区能源管理架构"
    prompt = model.ainvoke.await_args.args[0]
    assert "智慧园区能源管理架构" in prompt
    assert "采集、分析与控制" in prompt
    assert "raw-secret-payload" not in prompt
    assert "/private" not in prompt
    model.ainvoke.side_effect = RuntimeError("offline")
    assert asyncio.run(middleware._agenerate_title_result(state, "zh-CN"))["title"] == "智慧园区能源管理架构"


def test_prompt_excludes_hidden_reasoning_and_bounds_descriptive_inputs():
    middleware = TitleMiddleware(title_config=TitleConfig())
    state = {
        "messages": [
            HumanMessage("总结"),
            AIMessage("旧答案"),
            AIMessage(
                [
                    {"type": "reasoning", "text": "private-reasoning"},
                    {"type": "text", "text": "最终报告" + "内" * 20000},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,secret"}},
                ]
            ),
            AIMessage("hidden-progress", additional_kwargs={"hide_from_ui": True}),
            ToolMessage(
                "secret",
                tool_call_id="x",
                additional_kwargs={
                    "artifact_metadata": {
                        "title": "主题",
                        "description": "描" * 20000,
                        "binary": "secret",
                    }
                },
            ),
        ]
    }
    prompt, _ = middleware._build_title_prompt(state)
    assert "最终报告" in prompt
    assert "旧答案" not in prompt
    assert "private-reasoning" not in prompt
    assert "hidden-progress" not in prompt
    assert "secret" not in prompt
    assert len(prompt) < 5000


def test_latest_tool_call_cannot_freeze_title_from_earlier_prose():
    middleware = TitleMiddleware(title_config=TitleConfig())
    state = {"messages": [HumanMessage("生成演示文稿"), AIMessage("正在分析图片"), AIMessage("", tool_calls=[{"name": "build", "args": {}, "id": "b"}])]}
    assert not middleware._should_generate_title(state)


def test_processing_response_cannot_freeze_title_before_artifact_delivery():
    middleware = TitleMiddleware(title_config=TitleConfig())
    state = {"messages": [HumanMessage("制作PPT"), AIMessage("正在处理图片", additional_kwargs={"deerflow_processing": True})]}
    assert not middleware._should_generate_title(state)
    assert middleware._get_title_assistant_message(state) == ""
    state["messages"].append(AIMessage("已完成"))
    assert middleware._should_generate_title(state)


def test_unclosed_reasoning_is_never_title_context():
    middleware = TitleMiddleware(title_config=TitleConfig())
    state = {"messages": [HumanMessage("请求"), AIMessage("最终内容<think>secret unfinished")]}
    prompt, _ = middleware._build_title_prompt(state)
    assert "最终内容" in prompt
    assert "secret" not in prompt


def test_partial_and_manual_titles_keep_existing_behavior():
    middleware = TitleMiddleware(title_config=TitleConfig())
    state = {"messages": [HumanMessage("用户请求"), ToolMessage("", tool_call_id="x", additional_kwargs={"artifact_metadata": {"title": "内容主题"}})]}
    assert middleware._generate_title_result(state, allow_partial_exchange=True) == {"title": "用户请求"}
    state["title"] = "手动标题"
    assert asyncio.run(middleware._agenerate_title_result(state)) is None


def test_title_model_cancellation_is_not_swallowed(monkeypatch):
    model = MagicMock(ainvoke=AsyncMock(side_effect=asyncio.CancelledError))
    monkeypatch.setattr(module, "create_chat_model", MagicMock(return_value=model))
    middleware = TitleMiddleware(title_config=TitleConfig())
    state = {"messages": [HumanMessage("总结"), AIMessage("年度经营情况")]}
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(middleware._agenerate_title_result(state))
