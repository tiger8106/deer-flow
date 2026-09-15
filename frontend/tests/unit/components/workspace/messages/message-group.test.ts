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
  it("collapses completed processing and only exposes localized public progress", () => {
    const html = renderGroup([
      {
        id: "ppt-progress",
        type: "ai",
        content: "private Python implementation",
        additional_kwargs: {
          user_facing_progress: {
            "en-US": "Creating the presentation",
            "zh-CN": "正在制作 PPT",
          },
        },
        tool_calls: [
          {
            id: "ppt-call",
            name: "build_ppt",
            args: { secret: "private path" },
          },
        ],
      } as Message,
    ]);
    expect(html).toContain('data-completed-processing="true"');
    expect(html).not.toContain(" open=");
    expect(html).toContain("Creating the presentation");
    expect(html).toContain("private Python implementation");
    expect(html).not.toContain("build_ppt");
    expect(html).not.toContain("正在制作");
  });

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

  it.each([
    ["knowledge_query", "Knowledge search"],
    ["view_image", "Image recognition"],
  ])("uses a configured friendly label for %s", (name, label) => {
    // Only the latest activity is visible in a collapsed processing group.
    const html = renderGroup(
      [
        {
          id: "ai-tool",
          type: "ai",
          content: "",
          tool_calls: [{ id: "call-tool", name, args: {} }],
        } as Message,
      ],
      { [name]: { "en-US": label, "zh-CN": label } },
    );
    expect(html).toContain(label);
    expect(html).not.toContain(name);
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
      // React.createElement's overload requires this provider's children in props.
      // eslint-disable-next-line react/no-children-prop
      createElement(ToolDisplayLabelsProvider, {
        labels: toolDisplayLabels,
        children: createElement(MessageGroup, { messages }),
      }),
    ),
  );
}
