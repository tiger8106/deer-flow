import { afterEach, describe, expect, it, rs } from "@rstest/core";

import {
  loadDocumentPreview,
  supportsDocumentPreview,
} from "@/core/artifacts/document-preview";

rs.mock("@/core/artifacts/utils", () => ({
  urlOfArtifact: ({
    filepath,
    threadId,
  }: {
    filepath: string;
    threadId: string;
  }) => `/api/threads/${threadId}/artifacts${filepath}`,
}));

afterEach(() => {
  rs.unstubAllGlobals();
});

describe("local document previews", () => {
  it("supports office files without treating PDFs or code as Office documents", () => {
    expect(supportsDocumentPreview("/outputs/slides.PPTX")).toBe(true);
    expect(supportsDocumentPreview("/uploads/slides.ppt")).toBe(true);
    expect(supportsDocumentPreview("/outputs/report.docx")).toBe(true);
    expect(supportsDocumentPreview("/outputs/report.pdf")).toBe(false);
    expect(supportsDocumentPreview("/outputs/report.html")).toBe(false);
  });

  it("fetches only the authorized local endpoint and preserves filename characters", async () => {
    const fetch = rs.fn().mockResolvedValue(
      new Response("%PDF-1.7", {
        headers: { "content-type": "application/pdf" },
      }),
    );
    rs.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const blob = await loadDocumentPreview({
      filepath: "/mnt/user-data/outputs/a #?.pptx",
      threadId: "thread",
      signal,
    });
    expect(await blob.text()).toBe("%PDF-1.7");
    expect(fetch).toHaveBeenCalledWith(
      "/api/threads/thread/artifacts/mnt/user-data/outputs/a%20%23%3F.pptx?preview=true",
      { signal, credentials: "include" },
    );
  });

  it("rejects unavailable renders and login HTML instead of embedding errors", async () => {
    for (const response of [
      new Response("missing", { status: 404 }),
      new Response("login", { headers: { "content-type": "text/html" } }),
    ]) {
      rs.stubGlobal("fetch", rs.fn().mockResolvedValue(response));
      await expect(
        loadDocumentPreview({
          filepath: "/deck.pptx",
          threadId: "thread",
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("Document preview unavailable");
    }
  });
});
