import { expect, test } from "@playwright/test";

import { mockLangGraphAPI, MOCK_THREAD_ID } from "./utils/mock-api";

test("completed processing and final reasoning fold completely and reopen", async ({
  page,
}) => {
  mockLangGraphAPI(page, {
    threads: [
      {
        thread_id: MOCK_THREAD_ID,
        title: "Thought display",
        messages: [
          { type: "human", id: "human", content: "Compare these figures" },
          {
            type: "ai",
            id: "reason",
            content: "",
            additional_kwargs: {
              reasoning_content: "Ordinary source comparison.",
            },
          },
          {
            type: "ai",
            id: "tool",
            content: "Check the cited figures.",
            tool_calls: [
              {
                id: "search",
                name: "web_search",
                args: { query: "Exact source query" },
              },
            ],
          },
          { type: "tool", id: "result", tool_call_id: "search", content: "[]" },
          {
            type: "ai",
            id: "internal",
            content: "Private command explanation",
            tool_calls: [
              {
                id: "cmd",
                name: "bash",
                args: { command: "python secret.py" },
              },
            ],
          },
          {
            type: "tool",
            id: "cmd-result",
            tool_call_id: "cmd",
            content: "done",
          },
          {
            type: "ai",
            id: "final",
            content: "Finished comparison.",
            additional_kwargs: {
              reasoning_content:
                "Final source reasoning.\n\nRead SKILL.md and tool_choice.",
            },
          },
        ],
      },
    ],
  });
  await page.goto(`/workspace/chats/${MOCK_THREAD_ID}`);
  await expect(
    page.getByText("Finished comparison.", { exact: true }),
  ).toBeVisible();
  for (const text of [
    "Ordinary source comparison.",
    "Check the cited figures.",
    "Exact source query",
    "Final source reasoning.",
  ])
    await expect(page.getByText(text, { exact: false })).toBeHidden();
  const folds = page.getByRole("button", { name: /thinking|thought/i });
  expect(await folds.count()).toBeGreaterThanOrEqual(2);
  for (const fold of await folds.all()) await fold.click();
  for (const text of [
    "Ordinary source comparison.",
    "Check the cited figures.",
    "Exact source query",
    "Final source reasoning.",
  ])
    await expect(page.getByText(text, { exact: false })).toBeVisible();
  await expect(page.getByText("Private command explanation")).toBeHidden();
  await expect(page.getByText(/Read SKILL.md/)).toBeHidden();
});
