import { urlOfArtifact } from "./utils";

export const PDF_VIEWER_URL =
  "/pdf-preview/web/viewer.html#page=1&zoom=page-width&pagemode=none";

export function supportsDocumentPreview(filepath: string) {
  return /\.(pptx?|odp|docx?|odt|xlsx?|ods)$/i.test(filepath);
}

export async function loadDocumentPreview({
  filepath,
  threadId,
  signal,
}: {
  filepath: string;
  threadId: string;
  signal: AbortSignal;
}) {
  const response = await fetch(
    `${urlOfArtifact({ filepath: filepath.split("/").map(encodeURIComponent).join("/"), threadId })}?preview=true`,
    { signal, credentials: "include" },
  );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("application/pdf")
  ) {
    throw new Error("Document preview unavailable");
  }
  return response.blob();
}
