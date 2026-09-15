import { FileDownIcon } from "lucide-react";
import type { AnchorHTMLAttributes } from "react";

import { resolveArtifactURL } from "@/core/artifacts/utils";
import { cn } from "@/lib/utils";

import { CitationLink } from "../citations/citation-link";

function isExternalUrl(href: string | undefined): boolean {
  return !!href && /^https?:\/\//.test(href);
}

/**
 * Builds the `a` renderer shared by message content and generic markdown.
 * Passing a `threadId` also resolves `/mnt/` artifact links; without it those
 * links fall through to the default external-link handling.
 */
export function createMarkdownLinkComponent(threadId?: string) {
  return function MarkdownLink({
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) {
    if (typeof props.children === "string") {
      const match = /^citation:(.+)$/.exec(props.children);
      if (match) {
        const [, text] = match;
        return (
          <CitationLink {...props} href={href}>
            {text}
          </CitationLink>
        );
      }
    }
    if (threadId && href?.startsWith("/mnt/")) {
      const { children, className, ...rest } = props;
      return (
        <a
          {...rest}
          href={resolveArtifactURL(href, threadId)}
          className={cn(
            "not-prose border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 focus-visible:outline-primary my-1 inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
            className,
          )}
          target="_blank"
          rel="noopener noreferrer"
          data-artifact-download="true"
        >
          <FileDownIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="break-words">{children}</span>
        </a>
      );
    }
    const { className, target, rel, ...rest } = props;
    const external = isExternalUrl(href);
    return (
      <a
        {...rest}
        href={href}
        className={cn(
          "text-primary decoration-primary/30 hover:decoration-primary/60 underline underline-offset-2 transition-colors",
          className,
        )}
        target={target ?? (external ? "_blank" : undefined)}
        rel={rel ?? (external ? "noopener noreferrer" : undefined)}
      />
    );
  };
}
