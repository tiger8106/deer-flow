import { z } from "zod";

export const composerScopeNodeSchema: z.ZodType<ComposerScopeNode> = z.lazy(
  () =>
    z.object({
      id: z.string().min(1).max(200),
      label: z.string().min(1).max(500),
      kind: z.enum(["collection", "document"]),
      group: z
        .object({
          id: z.string().min(1).max(100),
          label: z.string().min(1).max(200),
          order: z.number().int().optional(),
        })
        .optional(),
      children: z.array(composerScopeNodeSchema),
    }),
);

const composerScopeResponseSchema = z.object({
  nodes: z.array(z.unknown()).transform((nodes) =>
    nodes.flatMap((node) => {
      const parsed = composerScopeNodeSchema.safeParse(node);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

export type ComposerScopeNode = {
  id: string;
  label: string;
  kind: "collection" | "document";
  group?: {
    id: string;
    label: string;
    order?: number;
  };
  children: ComposerScopeNode[];
};

export type ComposerScopeGroup = {
  id: string;
  label: string;
  order?: number;
  nodes: ComposerScopeNode[];
};

export type ComposerScopeGroupState = {
  selected: boolean;
  indeterminate: boolean;
};

export type ComposerExtensionSelection = {
  enabled: boolean;
  scopes: ComposerScopeRef[];
};

export type ComposerScopeRef = Pick<ComposerScopeNode, "kind" | "id">;

function scopeKey(scope: ComposerScopeRef) {
  return `${scope.kind}:${scope.id}`;
}

function nodeContainsScope(
  node: ComposerScopeNode,
  target: ComposerScopeRef,
): boolean {
  if (scopeKey(node) === scopeKey(target)) return true;
  return node.children.some((child) => nodeContainsScope(child, target));
}

function findScopeNode(
  nodes: ComposerScopeNode[],
  target: ComposerScopeRef,
): ComposerScopeNode | undefined {
  for (const node of nodes) {
    if (scopeKey(node) === scopeKey(target)) return node;
    const nested = findScopeNode(node.children, target);
    if (nested) return nested;
  }
  return undefined;
}

function scopeCoversTarget(
  scopes: ComposerScopeRef[],
  target: ComposerScopeRef,
  nodes: ComposerScopeNode[],
): boolean {
  return scopes.some((scope) => {
    if (scopeKey(scope) === scopeKey(target)) return true;
    const selectedNode = findScopeNode(nodes, scope);
    return selectedNode?.kind === "collection" &&
      nodeContainsScope(selectedNode, target);
  });
}

export function groupComposerScopeNodes(
  nodes: ComposerScopeNode[],
): ComposerScopeGroup[] {
  const groups = new Map<string, ComposerScopeGroup>();
  for (const node of nodes) {
    const id = node.group?.id ?? "ungrouped";
    const group = groups.get(id);
    if (group) {
      group.nodes.push(node);
      continue;
    }
    groups.set(id, {
      id,
      label: node.group?.label ?? "",
      order: node.group?.order,
      nodes: [node],
    });
  }
  return [...groups.values()].sort(
    (left, right) =>
      (left.order ?? Number.MAX_SAFE_INTEGER) -
      (right.order ?? Number.MAX_SAFE_INTEGER),
  );
}

export function getComposerScopeGroupState(
  scopes: ComposerScopeRef[],
  groupNodes: ComposerScopeNode[],
): ComposerScopeGroupState {
  const targets = groupNodes.map(({ kind, id }) => ({ kind, id }));
  const coveredCount = targets.filter((target) =>
    scopeCoversTarget(scopes, target, groupNodes),
  ).length;
  const hasGroupScope = scopes.some((scope) =>
    groupNodes.some((node) => nodeContainsScope(node, scope)),
  );
  const selected = targets.length > 0 && coveredCount === targets.length;
  return {
    selected,
    indeterminate: hasGroupScope && !selected,
  };
}

export function toggleComposerScope(
  scopes: ComposerScopeRef[],
  target: ComposerScopeRef,
  nodes: ComposerScopeNode[],
): ComposerScopeRef[] {
  const targetKey = scopeKey(target);
  if (scopes.some((scope) => scopeKey(scope) === targetKey)) {
    return scopes.filter((scope) => scopeKey(scope) !== targetKey);
  }

  const overlapping = new Set<string>();
  const collectDescendants = (node: ComposerScopeNode) => {
    for (const child of node.children) {
      overlapping.add(scopeKey(child));
      collectDescendants(child);
    }
  };
  const findTarget = (
    candidates: ComposerScopeNode[],
    ancestors: ComposerScopeRef[],
  ): boolean => {
    for (const node of candidates) {
      if (scopeKey(node) === targetKey) {
        ancestors.forEach((ancestor) => overlapping.add(scopeKey(ancestor)));
        collectDescendants(node);
        return true;
      }
      if (findTarget(node.children, [...ancestors, node])) return true;
    }
    return false;
  };
  findTarget(nodes, []);

  return [
    ...scopes.filter((scope) => !overlapping.has(scopeKey(scope))),
    target,
  ];
}

export function toggleComposerScopeGroup(
  scopes: ComposerScopeRef[],
  groupNodes: ComposerScopeNode[],
): ComposerScopeRef[] {
  const state = getComposerScopeGroupState(scopes, groupNodes);
  const retained = scopes.filter(
    (scope) => !groupNodes.some((node) => nodeContainsScope(node, scope)),
  );
  if (state.selected) return retained;

  return groupNodes.reduce(
    (current, node) =>
      toggleComposerScope(current, { kind: node.kind, id: node.id }, groupNodes),
    retained,
  );
}

export function findComposerScopeLabel(
  nodes: ComposerScopeNode[],
  target: ComposerScopeRef,
): string | null {
  for (const node of nodes) {
    if (node.kind === target.kind && node.id === target.id) return node.label;
    const nested = findComposerScopeLabel(node.children, target);
    if (nested) return nested;
  }
  return null;
}

export function getSelectedScopeExpansion(
  nodes: ComposerScopeNode[],
  scopes: ComposerScopeRef[],
): { folderIds: Set<string>; documentParentIds: Set<string> } {
  const selected = new Set(scopes.map((scope) => `${scope.kind}:${scope.id}`));
  const folderIds = new Set<string>();
  const documentParentIds = new Set<string>();

  const visit = (
    node: ComposerScopeNode,
    collectionPath: string[],
  ): boolean => {
    const isSelected = selected.has(`${node.kind}:${node.id}`);
    let containsSelection = isSelected;
    for (const child of node.children) {
      if (
        visit(
          child,
          node.kind === "collection"
            ? [...collectionPath, node.id]
            : collectionPath,
        )
      ) {
        containsSelection = true;
      }
    }
    if (containsSelection && node.kind === "collection") {
      collectionPath.forEach((id) => folderIds.add(id));
      if (isSelected) folderIds.add(node.id);
    }
    if (isSelected && node.kind === "document") {
      const parentId = collectionPath.at(-1);
      if (parentId) documentParentIds.add(parentId);
      collectionPath.slice(0, -1).forEach((id) => folderIds.add(id));
    }
    return containsSelection;
  };

  nodes.forEach((node) => visit(node, []));
  return { folderIds, documentParentIds };
}

export function parseComposerScopeResponse(value: unknown) {
  return composerScopeResponseSchema.parse(value);
}

export function buildComposerExtensionRunContext(
  selections: Record<string, ComposerExtensionSelection>,
): Record<string, unknown> {
  const active = Object.fromEntries(
    Object.entries(selections).filter(([, selection]) => selection.enabled),
  );
  return Object.keys(active).length > 0 ? { extensions: active } : {};
}
