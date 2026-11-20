import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it, rs } from "@rstest/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MessageGroup } from "@/components/workspace/messages/message-group";
import { I18nContext } from "@/core/i18n/context";
import { ToolDisplayLabelsProvider } from "@/core/tools/context";
import type { ToolDisplayLabels } from "@/core/tools/display-labels";

rs.mock("@/components/workspace/artifacts", () => ({
  useArtifacts: () => ({
    artifacts: [],
    setArtifacts: () => undefined,
    selectedArtifact: null,
    autoSelect: false,
    select: () => undefined,
    deselect: () => undefined,
    open: false,
    autoOpen: false,
    setOpen: () => undefined,
  }),
}));

describe("MessageGroup", () => {
  const messages: Message[] = [
    {
      type: "ai",
      id: "reason",
      content: "",
      additional_kwargs: { reasoning_content: "Compare the source figures." },
    },
    {
      type: "ai",
      id: "search",
      content: "Verify the evidence.",
      tool_calls: [
        { id: "query", name: "web_search", args: { query: "source figures" } },
      ],
    },
  ];
  it("shows ordinary reasoning and activity during a run", () => {
    const html = renderGroup(messages, {}, true).replace(/<[^>]*>/g, "");
    expect(html).toContain("Compare the source figures.");
    expect(html).toContain("Verify the evidence.");
    expect(html).toContain("source figures");
  });
  it("collapses all completed reasoning, text and the last tool together", () => {
    const html = renderGroup(messages);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Compare the source figures.");
    expect(html).not.toContain("Verify the evidence.");
    expect(html).not.toContain("source figures");
    expect(html).not.toContain("<details");
  });
  it("keeps internal commands and skill documents out of the thought display", () => {
    const html = renderGroup(
      [
        {
          type: "ai",
          id: "internal",
          content: "Run private implementation",
          additional_kwargs: { reasoning_content: "Inspect internal settings" },
          tool_calls: [
            {
              id: "cmd",
              name: "bash",
              args: {
                command: "python secret.py",
                description: "Private command",
              },
            },
            {
              id: "skill",
              name: "read_file",
              args: {
                path: "/mnt/skills/public/example/SKILL.md",
                description: "Read private skill",
              },
            },
          ],
        },
        ...messages,
      ] as Message[],
      {},
      true,
    );
    for (const text of [
      "private",
      "internal settings",
      "Private command",
      "secret.py",
      "SKILL.md",
    ])
      expect(html).not.toContain(text);
    expect(html.replace(/<[^>]*>/g, "")).toContain(
      "Compare the source figures.",
    );
  });
  it("keeps publication commentary inside the collapsible thinking panel", () => {
    const publication: Message[] = [
      {
        id: "publish",
        type: "ai",
        content: "文档已成功生成，文件大小约42KB。现在让我呈现给用户。",
        tool_calls: [
          {
            id: "present",
            name: "present_files",
            args: { filepaths: ["/mnt/user-data/outputs/report.docx"] },
          },
        ],
      },
    ];
    const expanded = renderGroup(publication, {}, true).replace(/<[^>]*>/g, "");
    expect(expanded).toContain("文档已成功生成");
    const collapsed = renderGroup(publication);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain("文档已成功生成");
  });
  it("preserves friendly business tool labels", () => {
    const html = renderGroup(
      [
        {
          type: "ai",
          content: "",
          tool_calls: [{ id: "kb", name: "knowledge_query", args: {} }],
        },
      ] as Message[],
      { knowledge_query: { "en-US": "Knowledge search", "zh-CN": "知识检索" } },
      true,
    );
    expect(html).toContain("Knowledge search");
    expect(html).not.toContain("knowledge_query");
  });
});

function renderGroup(
  messages: Message[],
  toolDisplayLabels: ToolDisplayLabels = {},
  isLoading = false,
) {
  return renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      {
        value: {
          locale: "en-US",
          setLocale: () => undefined,
        },
      },
      // React.createElement's overload requires this provider's children in props.
      // eslint-disable-next-line react/no-children-prop
      createElement(ToolDisplayLabelsProvider, {
        labels: toolDisplayLabels,
        children: createElement(MessageGroup, { messages, isLoading }),
      }),
    ),
  );
}
