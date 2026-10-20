import { useMemo } from "react";
import type { ComponentProps } from "react";
import { type Streamdown } from "streamdown";

import {
  capMarkdownNesting,
  normalizeStreamdownMathMarkdown,
} from "./preprocess";

type StreamdownChildren = ComponentProps<typeof Streamdown>["children"];

export function shouldCompleteStreamdownMarkdown(
  children: StreamdownChildren,
  requested = true,
): boolean {
  // Streamdown's completion pass counts TeX stars/underscores as Markdown
  // emphasis and appends markers after $$, swallowing its closing fence.
  // Keep math-bearing content verbatim; never repair the actual formula.
  return (
    requested && !(typeof children === "string" && /(?<!\\)\$/.test(children))
  );
}

export function getSafeStreamdownMarkdown(markdown: string): string {
  return normalizeStreamdownMathMarkdown(capMarkdownNesting(markdown));
}

export function getSafeStreamdownChildren(
  children: StreamdownChildren,
): StreamdownChildren {
  if (typeof children !== "string") {
    return children;
  }

  return getSafeStreamdownMarkdown(children);
}

export function useSafeStreamdownChildren(
  children: StreamdownChildren,
): StreamdownChildren {
  return useMemo(() => getSafeStreamdownChildren(children), [children]);
}

export function useSafeStreamdownMarkdown(markdown: string): string {
  return useMemo(() => getSafeStreamdownMarkdown(markdown), [markdown]);
}
