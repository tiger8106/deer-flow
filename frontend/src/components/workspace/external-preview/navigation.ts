export function getPreviewDocumentId(url: string | undefined, baseUrl: string) {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).searchParams.get("document_id");
  } catch {
    return null;
  }
}
