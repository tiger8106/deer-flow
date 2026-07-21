import { describe, expect, it } from "@rstest/core";

import { parseWorkspaceApps } from "@/core/workspace-apps/parse";

const knowledgeApp = {
  id: "knowledge",
  href: "/workspace/knowledge",
  embedUrl: "/knowledge/?embedded=1",
  labels: { "en-US": "Knowledge", "zh-CN": "知识管理" },
  icon: "library",
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
});
