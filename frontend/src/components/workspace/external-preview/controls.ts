// Embedded business previews own their URLs; the host only accepts same-origin downloads.
export function previewDownloadUrl(
  value: unknown,
  origin: string,
): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value, origin);
    if (
      url.origin === origin &&
      /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Invalid embedded metadata must not break the preview. */
  }
  return undefined;
}

export function downloadPreviewFile(url: string, filename = "") {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
