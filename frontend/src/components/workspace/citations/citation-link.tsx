import { ExternalLinkIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  getSidePanelPreviewTitle,
  isSidePanelPreviewURL,
} from "@/core/citations/side-panel-preview";
import { cn } from "@/lib/utils";

import { PreviewLink } from "../external-preview/preview-link";

export function CitationLink({
  href,
  children,
  ...props
}: ComponentProps<"a">) {
  const domain = extractDomain(href ?? "");

  // Priority: children > domain
  const childrenText =
    typeof children === "string"
      ? children.replace(/^citation:\s*/i, "")
      : null;
  const isGenericText = childrenText === "Source" || childrenText === "来源";
  const rawDisplayText = (!isGenericText && childrenText) ?? domain;
  const displayText = /^\d+$/.test(rawDisplayText || "")
    ? `[${rawDisplayText}]`
    : rawDisplayText;
  const opensSidePanel = isSidePanelPreviewURL(href);
  const previewTitle = getSidePanelPreviewTitle(href);
  const sourceTitle = previewTitle ?? displayText;

  return (
    <HoverCard closeDelay={0} openDelay={0}>
      <HoverCardTrigger asChild>
        <PreviewLink
          {...props}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center"
        >
          <Badge
            variant="outline"
            className="mx-0.5 cursor-pointer gap-1 rounded-full border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
          >
            {displayText}
            <ExternalLinkIcon className="size-3" />
          </Badge>
        </PreviewLink>
      </HoverCardTrigger>
      <HoverCardContent className={cn("relative w-80 p-0", props.className)}>
        <div className="p-3">
          <div className="space-y-1">
            {sourceTitle && (
              <h4 className="truncate text-sm leading-tight font-medium">
                {sourceTitle}
              </h4>
            )}
            {href && !previewTitle && (
              <p className="text-muted-foreground truncate text-xs break-all">
                {href}
              </p>
            )}
          </div>
          <PreviewLink
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
          >
            {opensSidePanel ? "Open preview" : "Visit source"}
            <ExternalLinkIcon className="size-3" />
          </PreviewLink>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}
