export function isSidePanelPreviewURL(href: string | undefined): boolean {
  if (!href) return false;
  try {
    const baseURL =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    return new URL(href, baseURL).searchParams.get("preview") === "side-panel";
  } catch {
    return false;
  }
}
