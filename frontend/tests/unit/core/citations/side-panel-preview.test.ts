import { describe, expect, it } from "@rstest/core";

import { isSidePanelPreviewURL } from "@/core/citations/side-panel-preview";

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
});
