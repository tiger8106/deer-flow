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
  it("renders assistant text attached to a tool-calling processing message", () => {
    const html = renderGroup([
      {
        id: "ai-1",
        type: "ai",
        content: "The browser action failed, so I will try another approach.",
        tool_calls: [
          {
            id: "call-1",
            name: "web_search",
            args: { query: "DeerFlow issue 4027" },
          },
        ],
      } as Message,
    ]);

    expect(html).toContain(
      "The browser action failed, so I will try another approach.",
    );
    expect(html).toContain("DeerFlow issue 4027");
  });

  it("does not expose raw tool identifiers in generic processing steps", () => {
    const html = renderGroup([
      {
        id: "ai-raw-tool",
        type: "ai",
        content: "",
        tool_calls: [
          {
            id: "call-raw-tool",
            name: "knowledge_query",
            args: {},
          },
        ],
      } as Message,
    ]);

    expect(html).not.toContain("knowledge_query");
    expect(html).toContain("Processing");
  });

  it("uses configured friendly labels for external tool activity", () => {
    const html = renderGroup(
      [
        {
          id: "ai-knowledge-tool",
          type: "ai",
          content: "",
          tool_calls: [
            {
              id: "call-knowledge-tool",
              name: "knowledge_query",
              args: {},
            },
          ],
        },
        {
          id: "ai-image-tool",
          type: "ai",
          content: "",
          tool_calls: [
            {
              id: "call-image-tool",
              name: "view_image",
              args: {},
            },
          ],
        },
      ] as Message[],
      {
        knowledge_query: {
          "en-US": "Knowledge search",
          "zh-CN": "知识库查询",
        },
        view_image: {
          "en-US": "Image recognition",
          "zh-CN": "图片识别",
        },
      },
    );

    expect(html).toContain("Knowledge search");
    expect(html).toContain("Image recognition");
    expect(html).not.toContain("knowledge_query");
    expect(html).not.toContain("view_image");
  });

  it("keeps assistant text visible while older tool steps stay collapsed", () => {
    const html = renderGroup([
      {
        id: "ai-1",
        type: "ai",
        content: "The first tool failed; I will try a narrower search.",
        tool_calls: [
          {
            id: "call-1",
            name: "web_search",
            args: { query: "first hidden query" },
          },
        ],
      } as Message,
      {
        id: "tool-1",
        type: "tool",
        name: "web_search",
        tool_call_id: "call-1",
        content: "[]",
      } as Message,
      {
        id: "ai-2",
        type: "ai",
        content: "The second approach should reveal the missing context.",
        tool_calls: [
          {
            id: "call-2",
            name: "bash",
            args: {
              description: "Inspect message rendering",
              command: "rg assistantText frontend/src",
            },
          },
        ],
      } as Message,
    ]);

    expect(html).toContain(
      "The first tool failed; I will try a narrower search.",
    );
    expect(html).toContain(
      "The second approach should reveal the missing context.",
    );
    expect(html).not.toContain("first hidden query");
    expect(html).toContain("Inspect message rendering");
    expect(html).toContain("1 more step");
  });

  it("keeps tool-calling assistant text visible when reasoning is also present", () => {
    const html = renderGroup([
      {
        id: "ai-1",
        type: "ai",
        content: "I found a likely cause, so I will inspect the renderer next.",
        additional_kwargs: {
          reasoning_content: "Check how processing groups convert messages.",
        },
        tool_calls: [
          {
            id: "call-1",
            name: "bash",
            args: {
              description: "Inspect renderer conversion",
              command: "sed -n '720,780p' message-group.tsx",
            },
          },
        ],
      } as Message,
    ]);

    expect(html).toContain(
      "I found a likely cause, so I will inspect the renderer next.",
    );
    expect(html).toContain("Inspect renderer conversion");
    expect(html).toContain("1 more step");
    expect(html).not.toContain("Check how processing groups convert messages.");
  });
});

function renderGroup(
  messages: Message[],
  toolDisplayLabels: ToolDisplayLabels = {},
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
      createElement(
        ToolDisplayLabelsProvider,
        { labels: toolDisplayLabels },
        createElement(MessageGroup, { messages }),
      ),
    ),
  );
}
