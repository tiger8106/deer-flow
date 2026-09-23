import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "@rstest/core";

import {
  getArtifactPathsForDisplay,
  getArtifactPathsForGroup,
  getArtifactPathsForGroups,
  shouldScrollToLatestOnSubmit,
} from "@/components/workspace/messages/message-list";
import type { MessageGroup } from "@/core/messages/utils";

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
      [
        "/mnt/user-data/outputs/deck.pptx",
        "/mnt/user-data/outputs/review.json",
      ],
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

    expect(paths).toEqual(["/mnt/user-data/outputs/deck.pptx"]);
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
            "/mnt/user-data/outputs/review.json",
            "/mnt/user-data/outputs/review.json",
          ],
        },
      },
    ] as Message[]);

    expect(paths).toEqual(["/mnt/user-data/outputs/new-deck.pptx"]);
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

  it("places PPT delivery after the following assistant answer", () => {
    const groups: MessageGroup[] = [
      {
        id: "human-1",
        type: "human" as const,
        messages: [{ type: "human", id: "human-1", content: "转成PPT" }],
      },
      {
        id: "processing-1",
        type: "assistant:processing" as const,
        messages: [
          {
            type: "tool",
            name: "finish_ppt",
            tool_call_id: "finish-1",
            content: "Delivered",
            additional_kwargs: {
              ppt_delivery: true,
              presented_files: ["/mnt/user-data/outputs/图片转PPT.pptx"],
            },
          },
        ],
      },
      {
        id: "answer-1",
        type: "assistant" as const,
        messages: [{ type: "ai", id: "answer-1", content: "已完成转换。" }],
      },
    ];

    expect(getArtifactPathsForGroups(groups)).toEqual([
      [],
      [],
      ["/mnt/user-data/outputs/图片转PPT.pptx"],
    ]);
  });

  it("moves legacy present_files PPT delivery after the assistant answer", () => {
    const groups: MessageGroup[] = [
      {
        id: "present-files-1",
        type: "assistant:present-files",
        messages: [
          {
            type: "ai",
            id: "present-files-1",
            content: "",
            tool_calls: [
              {
                id: "present-1",
                name: "present_files",
                args: {
                  filepaths: [
                    "/mnt/user-data/outputs/legacy-deck.pptx",
                    "/mnt/user-data/outputs/review.json",
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        id: "answer-legacy",
        type: "assistant",
        messages: [
          { type: "ai", id: "answer-legacy", content: "已完成转换。" },
        ],
      },
    ];

    expect(getArtifactPathsForGroups(groups)).toEqual([
      [],
      ["/mnt/user-data/outputs/legacy-deck.pptx"],
    ]);
  });
});
