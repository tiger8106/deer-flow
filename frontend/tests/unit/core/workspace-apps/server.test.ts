import { describe, expect, it } from "@rstest/core";

import { parseWorkspaceApps } from "@/core/workspace-apps/parse";
import { canAccessWorkspaceApp } from "@/core/workspace-apps/types";

const knowledgeApp = {
  id: "knowledge",
  href: "/workspace/knowledge",
  embedUrl: "/knowledge/?embedded=1",
  labels: { "en-US": "Knowledge", "zh-CN": "知识管理" },
  icon: "library",
  chatInput: {
    scopeEndpoint: "/api/knowledge/api/v1/chat/retrieval-scopes",
    labels: { "en-US": "Knowledge Base", "zh-CN": "知识库" },
    allLabel: { "en-US": "All knowledge bases", "zh-CN": "全部知识库" },
    partialLabel: {
      "en-US": "Some knowledge bases",
      "zh-CN": "部分知识库",
    },
  },
};

describe("parseWorkspaceApps", () => {
  it("accepts deployment-owned workspace applications", () => {
    expect(parseWorkspaceApps(JSON.stringify([knowledgeApp]))).toEqual([
      knowledgeApp,
    ]);
  });

  it("rejects malformed configuration and removes duplicate routes", () => {
    expect(parseWorkspaceApps("not-json")).toEqual([]);
    expect(
      parseWorkspaceApps(JSON.stringify([knowledgeApp, knowledgeApp])),
    ).toEqual([knowledgeApp]);
  });

  it("rejects external chat input scope endpoints", () => {
    expect(
      parseWorkspaceApps(
        JSON.stringify([
          {
            ...knowledgeApp,
            chatInput: {
              ...knowledgeApp.chatInput,
              scopeEndpoint: "https://example.com/scopes",
            },
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("accepts admin settings-menu apps and enforces their display role", () => {
    const accessControlApp = {
      ...knowledgeApp,
      id: "access-control",
      href: "/workspace/access-control",
      embedUrl: "/access-control/?embedded=1",
      icon: "shield",
      placement: "settings-menu" as const,
      requiredSystemRole: "admin" as const,
      chatInput: undefined,
    };
    const [parsed] = parseWorkspaceApps(JSON.stringify([accessControlApp]));

    expect(parsed).toEqual(accessControlApp);
    expect(canAccessWorkspaceApp(parsed!, "admin")).toBe(true);
    expect(canAccessWorkspaceApp(parsed!, "user")).toBe(false);
  });
});
