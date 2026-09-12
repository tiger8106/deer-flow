import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "@rstest/core";

import {
  getArtifactPathsForDisplay,
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
});
