export function isSidePanelPreviewURL(href: string | undefined): boolean {
  return parseSidePanelPreviewURL(href) !== null;
}

export function getSidePanelPreviewTitle(
  href: string | undefined,
): string | null {
  const url = parseSidePanelPreviewURL(href);
  const title = url?.searchParams.get("title")?.trim();
  return title?.length ? title : null;
}

export function getSidePanelPreviewKey(
  href: string | undefined,
): string | null {
  const url = parseSidePanelPreviewURL(href);
  const key = url?.searchParams.get("preview_key")?.trim();
  return key?.length ? key : null;
}

function parseSidePanelPreviewURL(href: string | undefined): URL | null {
  if (!href) return null;
  try {
    const baseURL =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const url = new URL(href, baseURL);
    return url.searchParams.get("preview") === "side-panel" ? url : null;
  } catch {
    return null;
  }
}
