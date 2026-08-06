import { describe, expect, it } from "@rstest/core";

import {
  buildComposerExtensionRunContext,
  getComposerScopeGroupState,
  getSelectedScopeExpansion,
  groupComposerScopeNodes,
  parseComposerScopeResponse,
  toggleComposerScope,
  toggleComposerScopeGroup,
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

  it("groups top-level scopes and toggles all content in a knowledge space", () => {
    const personalRoot = {
      id: "personal-root",
      label: "个人制度",
      kind: "collection" as const,
      group: { id: "personal", label: "个人知识库", order: 0 },
      children: [
        {
          id: "personal-doc",
          label: "个人手册.pdf",
          kind: "document" as const,
          group: { id: "personal", label: "个人知识库", order: 0 },
          children: [],
        },
      ],
    };
    const publicRoot = {
      id: "public-root",
      label: "公共制度",
      kind: "collection" as const,
      group: { id: "public", label: "公共知识库", order: 1 },
      children: [],
    };
    const nodes = [publicRoot, personalRoot];
    const [personalGroup, publicGroup] = groupComposerScopeNodes(nodes);

    expect(personalGroup?.label).toBe("个人知识库");
    expect(publicGroup?.label).toBe("公共知识库");
    expect(
      getComposerScopeGroupState([], personalGroup?.nodes ?? []),
    ).toEqual({ selected: false, indeterminate: false });

    const selected = toggleComposerScopeGroup([], personalGroup!.nodes);
    expect(selected).toEqual([{ kind: "collection", id: "personal-root" }]);
    expect(
      getComposerScopeGroupState(selected, personalGroup!.nodes),
    ).toEqual({ selected: true, indeterminate: false });
    expect(toggleComposerScopeGroup(selected, personalGroup!.nodes)).toEqual(
      [],
    );
  });

  it("marks a knowledge space as partially selected when a child is chosen", () => {
    const nodes = [
      {
        id: "root",
        label: "个人制度",
        kind: "collection" as const,
        group: { id: "personal", label: "个人知识库", order: 0 },
        children: [
          {
            id: "doc",
            label: "手册.pdf",
            kind: "document" as const,
            group: { id: "personal", label: "个人知识库", order: 0 },
            children: [],
          },
        ],
      },
    ];
    const group = groupComposerScopeNodes(nodes)[0]!;
    expect(
      getComposerScopeGroupState(
        [{ kind: "document", id: "doc" }],
        group.nodes,
      ),
    ).toEqual({ selected: false, indeterminate: true });
  });

  it("drops malformed scope nodes returned by an extension", () => {
    expect(
      parseComposerScopeResponse({
        nodes: [
          {
            id: "dataset-1",
            label: "制度",
            kind: "collection",
            group: { id: "public", label: "公共知识库" },
            children: [],
          },
          { id: "bad", label: "", kind: "document" },
        ],
      }),
    ).toEqual({
      nodes: [
        {
          id: "dataset-1",
          label: "制度",
          kind: "collection",
          group: { id: "public", label: "公共知识库" },
          children: [],
        },
      ],
    });
  });
});
