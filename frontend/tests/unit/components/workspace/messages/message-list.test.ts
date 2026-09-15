import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "@rstest/core";

import {
  getArtifactPathsForDisplay,
  getArtifactPathsForGroup,
  shouldScrollToLatestOnSubmit,
} from "@/components/workspace/messages/message-list";

describe("MessageList submission scrolling", () => {
  it("scrolls when a new submission starts", () => {
    expect(shouldScrollToLatestOnSubmit(false, true)).toBe(true);
  });

  it("does not retrigger while submitting or after completion", () => {
    expect(shouldScrollToLatestOnSubmit(true, true)).toBe(false);
    expect(shouldScrollToLatestOnSubmit(true, false)).toBe(false);
    expect(shouldScrollToLatestOnSubmit(false, false)).toBe(false);
  });
});

describe("Conversation artifact placement", () => {
  it("merges live presented files with thread artifacts in stable order", () => {
    const paths = getArtifactPathsForDisplay(
      ["/mnt/user-data/outputs/deck.pptx"],
      [
        {
          id: "present-files",
          type: "ai",
          content: "",
          tool_calls: [
            {
              id: "present-1",
              name: "present_files",
              args: {
                filepaths: [
                  "/mnt/user-data/outputs/deck.pptx",
                  "/mnt/user-data/outputs/review.json",
                ],
              },
            },
          ],
        },
      ] as Message[],
    );

    expect(paths).toEqual([
      "/mnt/user-data/outputs/deck.pptx",
      "/mnt/user-data/outputs/review.json",
    ]);
  });

  it("keeps direct artifact delivery attached to its own message group", () => {
    const paths = getArtifactPathsForGroup([
      {
        type: "tool",
        name: "finish_ppt",
        tool_call_id: "finish-1",
        content: "Delivered",
        additional_kwargs: {
          ppt_delivery: true,
          presented_files: [
            "/mnt/user-data/outputs/new-deck.pptx",
            "/mnt/user-data/outputs/new-review.json",
          ],
        },
      },
    ] as Message[]);

    expect(paths).toEqual([
      "/mnt/user-data/outputs/new-deck.pptx",
      "/mnt/user-data/outputs/new-review.json",
    ]);
  });

  it("keeps legacy direct delivery cards attached to their own group", () => {
    const paths = getArtifactPathsForGroup([
      {
        type: "tool",
        name: "finish_ppt",
        tool_call_id: "finish-legacy",
        content: JSON.stringify({
          files: ["/mnt/user-data/outputs/legacy-deck.pptx"],
        }),
        additional_kwargs: { ppt_delivery: true },
      },
    ] as Message[]);

    expect(paths).toEqual(["/mnt/user-data/outputs/legacy-deck.pptx"]);
  });

  it("does not include artifacts from another group", () => {
    const paths = getArtifactPathsForGroup([
      { type: "ai", id: "answer", content: "继续处理" },
    ] as Message[]);

    expect(paths).toEqual([]);
  });
});
