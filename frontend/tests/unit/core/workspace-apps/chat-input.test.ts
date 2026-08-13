import { afterEach, describe, expect, it } from "@rstest/core";

import {
  buildComposerExtensionRunContext,
  getComposerScopeGroupState,
  getComposerScopeSelectionLabel,
  getSelectedScopeExpansion,
  groupComposerScopeNodes,
  loadPersistedComposerExtensionSelections,
  parseComposerScopeResponse,
  persistComposerExtensionScopes,
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

  it("forwards a selected scope even when explicit mode is off", () => {
    expect(
      buildComposerExtensionRunContext({
        knowledge: {
          enabled: false,
          scopes: [{ kind: "collection", id: "personal-root" }],
        },
      }),
    ).toEqual({
      extensions: {
        knowledge: {
          enabled: false,
          scopes: [{ kind: "collection", id: "personal-root" }],
        },
      },
    });
    expect(
      buildComposerExtensionRunContext({
        knowledge: { enabled: false, scopes: [] },
      }),
    ).toEqual({});
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
    expect(getComposerScopeGroupState([], personalGroup?.nodes ?? [])).toEqual({
      selected: false,
      indeterminate: false,
    });

    const selected = toggleComposerScopeGroup([], personalGroup!.nodes);
    expect(selected).toEqual([{ kind: "collection", id: "personal-root" }]);
    expect(getComposerScopeGroupState(selected, personalGroup!.nodes)).toEqual({
      selected: true,
      indeterminate: false,
    });
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

  it("labels all, one complete group, and mixed selections", () => {
    const nodes = [
      {
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
      },
      {
        id: "public-root",
        label: "公共制度",
        kind: "collection" as const,
        group: { id: "public", label: "公共知识库", order: 1 },
        children: [],
      },
      {
        id: "authorized-root",
        label: "授权制度",
        kind: "collection" as const,
        group: { id: "authorized", label: "授权知识库", order: 2 },
        children: [],
      },
    ];

    expect(
      getComposerScopeSelectionLabel(nodes, [], "全部知识库", "部分知识库"),
    ).toBe("全部知识库");
    expect(
      getComposerScopeSelectionLabel(
        nodes,
        [{ kind: "collection", id: "personal-root" }],
        "全部知识库",
        "部分知识库",
      ),
    ).toBe("个人知识库");
    expect(
      getComposerScopeSelectionLabel(
        nodes,
        [{ kind: "collection", id: "public-root" }],
        "全部知识库",
        "部分知识库",
      ),
    ).toBe("公共知识库");
    expect(
      getComposerScopeSelectionLabel(
        nodes,
        [{ kind: "collection", id: "authorized-root" }],
        "全部知识库",
        "部分知识库",
      ),
    ).toBe("授权知识库");
    expect(
      getComposerScopeSelectionLabel(
        nodes,
        [
          { kind: "collection", id: "personal-root" },
          { kind: "collection", id: "public-root" },
        ],
        "全部知识库",
        "部分知识库",
      ),
    ).toBe("部分知识库");
    expect(
      getComposerScopeSelectionLabel(
        nodes,
        [{ kind: "document", id: "personal-doc" }],
        "全部知识库",
        "部分知识库",
      ),
    ).toBe("部分知识库");
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

describe("workspace app scope persistence", () => {
  const store = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  };

  afterEach(() => {
    store.clear();
    delete (globalThis as { window?: unknown }).window;
  });

  it("restores scopes for the same user without restoring explicit mode", () => {
    (globalThis as { window?: unknown }).window = fakeWindow;
    persistComposerExtensionScopes("user-a", "knowledge", [
      { kind: "collection", id: "personal-root" },
    ]);

    expect(loadPersistedComposerExtensionSelections("user-a")).toEqual({
      knowledge: {
        enabled: false,
        scopes: [{ kind: "collection", id: "personal-root" }],
      },
    });
    expect(loadPersistedComposerExtensionSelections("user-b")).toEqual({});
  });

  it("ignores malformed persisted data and safely no-ops during SSR", () => {
    (globalThis as { window?: unknown }).window = fakeWindow;
    store.set(
      "deerflow.composer-extension-scopes.user-a",
      JSON.stringify({ knowledge: [{ kind: "invalid", id: "dataset" }] }),
    );
    expect(loadPersistedComposerExtensionSelections("user-a")).toEqual({});

    delete (globalThis as { window?: unknown }).window;
    expect(() =>
      persistComposerExtensionScopes("user-a", "knowledge", []),
    ).not.toThrow();
  });
});
