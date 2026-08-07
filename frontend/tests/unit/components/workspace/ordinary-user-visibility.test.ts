import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "@rstest/core";

const FRONTEND_ROOT = resolve(__dirname, "../../../..");

function source(path: string) {
  return readFileSync(resolve(FRONTEND_ROOT, path), "utf8");
}

describe("ordinary user chat visibility", () => {
  it("gates scheduled tasks and token usage on the standard chat page", () => {
    const chatPage = source("src/app/workspace/chats/[thread_id]/page.tsx");

    expect(chatPage).toContain(
      'import { useAuth } from "@/core/auth/AuthProvider";',
    );
    expect(chatPage).toContain(
      'const isAdmin = user?.system_role === "admin";',
    );
    expect(chatPage).toContain(
      "const canViewTokenUsage = isAdmin && tokenUsageEnabled;",
    );
    expect(chatPage).toContain("{isAdmin && !isNewThread && (");
    expect(chatPage).toContain("{canViewTokenUsage && (");
    expect(chatPage).toContain("{ enabled: canViewTokenUsage && !isMock },");
    expect(chatPage).toContain(
      "const tokenUsageInlineMode = canViewTokenUsage",
    );
  });

  it("gates token usage on agent chats and sidecar conversations", () => {
    const agentChatPage = source(
      "src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx",
    );
    const sidecarPanel = source(
      "src/components/workspace/sidecar/sidecar-panel.tsx",
    );

    expect(agentChatPage).toContain(
      "const canViewTokenUsage = isAdmin && tokenUsageEnabled;",
    );
    expect(agentChatPage).toContain("{canViewTokenUsage && (");
    expect(agentChatPage).toContain(
      "{ enabled: canViewTokenUsage && !isMock },",
    );
    expect(agentChatPage).toContain(
      "const tokenUsageInlineMode = canViewTokenUsage",
    );
    expect(sidecarPanel).toContain(
      'const canViewTokenUsage = user?.system_role === "admin" && tokenUsageEnabled;',
    );
    expect(sidecarPanel).toContain(
      "const tokenUsageInlineMode = canViewTokenUsage",
    );
  });

  it("hides subtask token usage from ordinary users", () => {
    const subtaskCard = source(
      "src/components/workspace/messages/subtask-card.tsx",
    );

    expect(subtaskCard).toContain(
      'import { useAuth } from "@/core/auth/AuthProvider";',
    );
    expect(subtaskCard).toContain(
      'user?.system_role === "admin" && tokenUsageEnabled',
    );
    expect(subtaskCard).toContain("const tokenLabel = canViewTokenUsage");
    expect(subtaskCard).toContain(
      "const runtimeUsageLabel = canViewTokenUsage",
    );
  });
});
