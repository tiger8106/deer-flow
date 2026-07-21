import { describe, expect, it } from "@rstest/core";

import { getPreviewDocumentId } from "@/components/workspace/external-preview/navigation";

describe("getPreviewDocumentId", () => {
  it("keeps the same document identity when only page and highlights change", () => {
    const baseUrl = "http://localhost:2026";
    const first = getPreviewDocumentId(
      "/knowledge/citation-preview?document_id=doc-1&page=2&highlights=a",
      baseUrl,
    );
    const second = getPreviewDocumentId(
      "/knowledge/citation-preview?document_id=doc-1&page=19&highlights=b",
      baseUrl,
    );

    expect(first).toBe("doc-1");
    expect(second).toBe(first);
  });

  it("distinguishes different documents", () => {
    expect(
      getPreviewDocumentId(
        "/knowledge/citation-preview?document_id=doc-2&page=1",
        "http://localhost:2026",
      ),
    ).toBe("doc-2");
  });
});
