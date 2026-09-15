import type { Message } from "@langchain/langgraph-sdk";
import { expect, it } from "@rstest/core";

import {
  getActiveTurnStartIndex,
  getMessageGroups,
} from "@/core/messages/utils";

it("keeps processing active until the whole user turn ends", () => {
  const groups = getMessageGroups([
    { type: "human", id: "old", content: "old task" },
    { type: "ai", id: "done", content: "done" },
    { type: "human", id: "new", content: "new task" },
    {
      type: "ai",
      id: "thinking",
      content: "",
      additional_kwargs: { reasoning_content: "working" },
    },
    { type: "ai", id: "answer", content: "partial answer" },
  ] as Message[]);
  expect(getActiveTurnStartIndex(groups)).toBe(3);
  expect(
    groups.slice(getActiveTurnStartIndex(groups)).map((group) => group.id),
  ).toEqual(["thinking", "answer"]);
  expect(getActiveTurnStartIndex([])).toBe(0);
});

it("attaches delayed files to the original call, never the new turn", () => {
  const groups = getMessageGroups([
    { type: "human", id: "old", content: "first task" },
    {
      type: "ai",
      id: "delivery",
      content: "",
      tool_calls: [
        {
          id: "call-old",
          name: "present_files",
          args: { filepaths: ["/old/deck.pptx"] },
        },
      ],
    },
    { type: "human", id: "new", content: "second task" },
    {
      type: "ai",
      id: "working",
      content: "",
      tool_calls: [{ id: "call-new", name: "build", args: {} }],
    },
    {
      type: "tool",
      id: "late",
      tool_call_id: "call-old",
      content: "delivered",
      additional_kwargs: {
        presented_files: ["/old/deck.pptx", "/old/review.json"],
      },
    },
  ] as Message[]);
  expect(groups[1]?.messages.map((message) => message.id)).toEqual([
    "delivery",
    "late",
  ]);
  expect(groups[3]?.messages.map((message) => message.id)).toEqual(["working"]);
});
