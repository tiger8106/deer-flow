import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "@rstest/core";

import {
  getArtifactPathsForDisplay,
  getArtifactPathsForGroup,
  getArtifactPathsForGroups,
  shouldScrollToLatestOnSubmit,
} from "@/components/workspace/messages/message-list";
import { getMessageGroups, type MessageGroup } from "@/core/messages/utils";

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

describe("Format-independent delivery", () => {
  const answer: MessageGroup = {
    id: "answer",
    type: "assistant",
    messages: [{ type: "ai", content: "完成。" }],
  };
  const human: MessageGroup = {
    id: "human",
    type: "human",
    messages: [{ type: "human", content: "下一轮" }],
  };
  function delivery(paths: string[], metadata = false): MessageGroup {
    return {
      id: "delivery",
      type: metadata ? "assistant:processing" : "assistant:present-files",
      messages: metadata
        ? [
            {
              type: "tool",
              name: "publish",
              tool_call_id: "publish",
              content: "ready",
              additional_kwargs: { presented_files: paths },
            },
          ]
        : [
            {
              type: "ai",
              content: "",
              tool_calls: [
                {
                  id: "present",
                  name: "present_files",
                  args: { filepaths: paths },
                },
              ],
            },
          ],
    };
  }
  for (const ext of [
    "docx",
    "doc",
    "xlsx",
    "xls",
    "pdf",
    "csv",
    "txt",
    "md",
    "html",
    "png",
    "zip",
    "odt",
    "ods",
    "odp",
    "pptx",
  ]) {
    for (const metadata of [false, true]) {
      it(`places ${ext} after answer (metadata: ${metadata})`, () => {
        const path = `/mnt/user-data/outputs/result.${ext}`;
        expect(
          getArtifactPathsForGroups([delivery([path], metadata), answer]),
        ).toEqual([[], [path]]);
      });
    }
  }
  it("keeps files accessible without an answer and never crosses user turns", () => {
    expect(getArtifactPathsForGroups([delivery(["report.docx"])])).toEqual([
      ["report.docx"],
    ]);
    expect(
      getArtifactPathsForGroups([delivery(["report.docx"]), human, answer]),
    ).toEqual([["report.docx"], [], []]);
  });
  it("deduplicates mixed deliveries without moving prior answer cards", () => {
    expect(
      getArtifactPathsForGroups([
        delivery(["report.docx", "table.xlsx"]),
        delivery(["report.docx", "report.pdf"], true),
        answer,
        human,
        delivery(["next.zip"]),
        answer,
      ]),
    ).toEqual([
      [],
      [],
      ["report.docx", "table.xlsx", "report.pdf"],
      [],
      [],
      ["next.zip"],
    ]);
  });
});

describe("File publication grouping", () => {
  for (const ext of ["docx", "xlsx", "pdf", "csv", "png", "zip", "pptx"]) {
    it(`keeps ${ext} publication text and usage in thinking with files after the answer`, () => {
      const path = `/mnt/user-data/outputs/report.${ext}`;
      const progress: Message = {
        id: "progress",
        type: "ai",
        content: "正在生成文件",
        additional_kwargs: { deerflow_processing: true },
      };
      const publication: Message = {
        id: "publish",
        type: "ai",
        content: "文档已成功生成，文件大小约42KB。现在让我呈现给用户。",
        tool_calls: [
          { id: "present", name: "present_files", args: { filepaths: [path] } },
        ],
        usage_metadata: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
        },
      };
      const result: Message = {
        id: "result",
        type: "tool",
        tool_call_id: "present",
        content: "ready",
        additional_kwargs: { presented_files: [path] },
      };
      const answer: Message = {
        id: "answer",
        type: "ai",
        content: "已完成整理。",
      };
      const groups = getMessageGroups([progress, publication, result, answer]);
      expect(groups.map((group) => group.type)).toEqual([
        "assistant:processing",
        "assistant",
      ]);
      expect(groups[0]?.messages).toEqual([progress, publication, result]);
      expect(getArtifactPathsForGroups(groups)).toEqual([[], [path]]);
      // Interrupted runs still expose the file, while preserving progress text.
      const interrupted = getMessageGroups([progress, publication, result]);
      expect(interrupted[0]?.messages).toEqual([progress, publication, result]);
      expect(getArtifactPathsForGroups(interrupted)).toEqual([[path]]);
    });
  }
});
