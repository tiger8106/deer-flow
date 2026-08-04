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
  scope?: { kind: "collection" | "document"; id: string };
};

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
