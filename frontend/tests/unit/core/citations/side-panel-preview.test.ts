import { describe, expect, it } from "@rstest/core";

import {
  getSidePanelPreviewTitle,
  isSidePanelPreviewURL,
} from "@/core/citations/side-panel-preview";

describe("isSidePanelPreviewURL", () => {
  it("accepts explicit same-origin or external side-panel preview links", () => {
    expect(
      isSidePanelPreviewURL(
        "http://localhost/knowledge/citation-preview?preview=side-panel",
      ),
    ).toBe(true);
  });

  it("does not intercept ordinary citation sources", () => {
    expect(isSidePanelPreviewURL("https://example.com/report.pdf")).toBe(false);
    expect(isSidePanelPreviewURL(undefined)).toBe(false);
  });

  it("reads the explicit title carried by a side-panel preview link", () => {
    expect(
      getSidePanelPreviewTitle(
        "http://localhost/knowledge/citation-preview?preview=side-panel&title=%E6%9D%90%E6%96%99%E6%8E%A5%E8%A7%A6%E5%BA%94%E5%8A%9B.pdf",
      ),
    ).toBe("材料接触应力.pdf");
    expect(
      getSidePanelPreviewTitle("https://example.com/report.pdf"),
    ).toBeNull();
  });
});
