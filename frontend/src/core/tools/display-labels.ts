import type { Locale } from "../i18n";

export type ToolDisplayLabel = Record<Locale, string>;
export type ToolDisplayLabels = Record<string, ToolDisplayLabel>;

export function resolveToolDisplayLabel(
  toolName: string,
  locale: Locale,
  labels: ToolDisplayLabels,
  fallback: string,
): string {
  const configuredLabel = labels[toolName]?.[locale];
  return configuredLabel?.trim() ? configuredLabel : fallback;
}
