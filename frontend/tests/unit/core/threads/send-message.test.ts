import type { Message } from "@langchain/langgraph-sdk";
import { expect, test } from "@rstest/core";

import {
  buildThreadRunContext,
  buildThreadSubmitMessages,
} from "@/core/threads/hooks";

const baseContext = {
  mode: "flash" as const,
  model_name: undefined,
  reasoning_effort: undefined,
};

test("sends the Chinese UI locale in run context for title generation", () => {
  expect(
    buildThreadRunContext({
      context: baseContext,
      locale: "zh-CN",
      threadId: "thread-zh",
    }),
  ).toMatchObject({
    title_locale: "zh-CN",
    thread_id: "thread-zh",
  });
});

test("sends the English UI locale in run context for title generation", () => {
  expect(
    buildThreadRunContext({
      context: baseContext,
      locale: "en-US",
      threadId: "thread-en",
    }),
  ).toMatchObject({
    title_locale: "en-US",
    thread_id: "thread-en",
  });
});

test("builds thread submit messages with hidden sidecar context before the visible user message", () => {
  const hiddenContext = {
    type: "human",
    content: "Hidden sidecar context",
    additional_kwargs: {
      hide_from_ui: true,
      sidecar_context: true,
    },
  } as Message;

  const messages = buildThreadSubmitMessages({
    text: "What should we do next?",
    additionalInputMessages: [hiddenContext],
  });

  expect(messages).toEqual([
    hiddenContext,
    {
      type: "human",
      content: [{ type: "text", text: "What should we do next?" }],
      additional_kwargs: {},
    },
  ]);
});

test("keeps uploaded files on the visible user message only", () => {
  const messages = buildThreadSubmitMessages({
    text: "Use this file",
    additionalInputMessages: [
      {
        type: "human",
        content: "Hidden sidecar context",
        additional_kwargs: { hide_from_ui: true },
      } as Message,
    ],
    filesForSubmit: [
      {
        filename: "report.pdf",
        size: 42,
        path: "/uploads/report.pdf",
        status: "uploaded",
      },
    ],
  });

  expect(messages[0]?.additional_kwargs).toEqual({ hide_from_ui: true });
  expect(messages[1]?.additional_kwargs).toEqual({
    files: [
      {
        filename: "report.pdf",
        size: 42,
        path: "/uploads/report.pdf",
        status: "uploaded",
      },
    ],
  });
});

test("keeps human input response metadata on the hidden user message", () => {
  const response = {
    version: 1,
    kind: "human_input_response",
    source: "ask_clarification",
    request_id: "clarification:call-abc",
    response_kind: "option",
    option_id: "option-2",
    value: "staging",
  };

  const messages = buildThreadSubmitMessages({
    text: 'For your clarification "Which environment?", my answer is: staging',
    additionalKwargs: {
      hide_from_ui: true,
      human_input_response: response,
    },
  });

  expect(messages).toEqual([
    {
      type: "human",
      content: [
        {
          type: "text",
          text: 'For your clarification "Which environment?", my answer is: staging',
        },
      ],
      additional_kwargs: {
        hide_from_ui: true,
        human_input_response: response,
      },
    },
  ]);
});
