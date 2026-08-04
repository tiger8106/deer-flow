import { describe, expect, it } from "@rstest/core";

import {
  buildComposerExtensionRunContext,
  getSelectedScopeExpansion,
  parseComposerScopeResponse,
  toggleComposerScope,
} from "@/core/workspace-apps/chat-input";

describe("workspace app chat input", () => {
  it("builds an opaque run-scoped extension context", () => {
    expect(
      buildComposerExtensionRunContext({
        knowledge: {
          enabled: true,
          scopes: [
            { kind: "collection", id: "dataset-1" },
            { kind: "document", id: "doc-1" },
          ],
        },
      }),
    ).toEqual({
      extensions: {
        knowledge: {
          enabled: true,
          scopes: [
            { kind: "collection", id: "dataset-1" },
            { kind: "document", id: "doc-1" },
          ],
        },
      },
    });
  });

  it("keeps unrelated scopes but removes overlapping ancestors and descendants", () => {
    const root = { kind: "collection" as const, id: "root" };
    const child = { kind: "collection" as const, id: "child" };
    const document = { kind: "document" as const, id: "doc-1" };
    const unrelated = { kind: "collection" as const, id: "unrelated" };
    const nodes = [
      {
        ...root,
        label: "根目录",
        children: [
          {
            ...child,
            label: "子目录",
            children: [{ ...document, label: "制度.pdf", children: [] }],
          },
        ],
      },
      { ...unrelated, label: "其他目录", children: [] },
    ];

    expect(toggleComposerScope([root, unrelated], child, nodes)).toEqual([
      unrelated,
      child,
    ]);
    expect(toggleComposerScope([root, unrelated], document, nodes)).toEqual([
      unrelated,
      document,
    ]);
    expect(
      toggleComposerScope([child, document, unrelated], root, nodes),
    ).toEqual([unrelated, root]);
    expect(toggleComposerScope([child, unrelated], child, nodes)).toEqual([
      unrelated,
    ]);
  });

  it("expands only paths needed to reveal selected scopes when opened", () => {
    const nodes = [
      {
        id: "root",
        label: "根目录",
        kind: "collection" as const,
        children: [
          {
            id: "child",
            label: "子目录",
            kind: "collection" as const,
            children: [
              {
                id: "doc-1",
                label: "制度.pdf",
                kind: "document" as const,
                children: [],
              },
            ],
          },
        ],
      },
    ];

    expect(
      getSelectedScopeExpansion(nodes, [{ kind: "document", id: "doc-1" }]),
    ).toEqual({
      folderIds: new Set(["root"]),
      documentParentIds: new Set(["child"]),
    });
    expect(
      getSelectedScopeExpansion(nodes, [{ kind: "collection", id: "child" }]),
    ).toEqual({
      folderIds: new Set(["root", "child"]),
      documentParentIds: new Set(),
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
