"use client";

import type { ComponentProps } from "react";

import {
  getSidePanelPreviewTitle,
  isSidePanelPreviewURL,
} from "@/core/citations/side-panel-preview";

import { useMaybeExternalPreview } from "./context";

/** All source surfaces honor the same opt-in preview protocol. */
export function PreviewLink({
  href,
  onClick,
  target,
  rel,
  ...props
}: ComponentProps<"a">) {
  const preview = useMaybeExternalPreview();
  const opensPanel = isSidePanelPreviewURL(href);
  return (
    <a
      {...props}
      href={href}
      target={opensPanel ? undefined : target}
      rel={opensPanel ? undefined : rel}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && opensPanel && href && preview) {
          event.preventDefault();
          event.stopPropagation();
          preview.open({
            url: href,
            title: getSidePanelPreviewTitle(href) ?? "Preview",
          });
        }
      }}
    />
  );
}
