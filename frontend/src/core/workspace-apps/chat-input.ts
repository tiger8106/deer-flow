import { z } from "zod";

export const composerScopeNodeSchema: z.ZodType<ComposerScopeNode> = z.lazy(
  () =>
    z.object({
      id: z.string().min(1).max(200),
      label: z.string().min(1).max(500),
      kind: z.enum(["collection", "document"]),
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
  children: ComposerScopeNode[];
};

export type ComposerExtensionSelection = {
  enabled: boolean;
  scopes: ComposerScopeRef[];
};

export type ComposerScopeRef = Pick<ComposerScopeNode, "kind" | "id">;

export function toggleComposerScope(
  scopes: ComposerScopeRef[],
  target: ComposerScopeRef,
): ComposerScopeRef[] {
  const exists = scopes.some(
    (scope) => scope.kind === target.kind && scope.id === target.id,
  );
  return exists
    ? scopes.filter(
        (scope) => scope.kind !== target.kind || scope.id !== target.id,
      )
    : [...scopes, target];
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
