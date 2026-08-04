import { describe, expect, it } from "@rstest/core";

import {
  buildComposerExtensionRunContext,
  parseComposerScopeResponse,
} from "@/core/workspace-apps/chat-input";

describe("workspace app chat input", () => {
  it("builds an opaque run-scoped extension context", () => {
    expect(
      buildComposerExtensionRunContext({
        knowledge: { enabled: true, scope: { kind: "document", id: "doc-1" } },
      }),
    ).toEqual({
      extensions: {
        knowledge: {
          enabled: true,
          scope: { kind: "document", id: "doc-1" },
        },
      },
    });
  });

  it("drops malformed scope nodes returned by an extension", () => {
    expect(
      parseComposerScopeResponse({
        nodes: [
          { id: "dataset-1", label: "制度", kind: "collection", children: [] },
          { id: "bad", label: "", kind: "document" },
        ],
      }),
    ).toEqual({
      nodes: [
        { id: "dataset-1", label: "制度", kind: "collection", children: [] },
      ],
    });
  });
});
