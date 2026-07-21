import { describe, expect, it } from "@rstest/core";

import { clampPreviewPanelPercent } from "@/components/workspace/external-preview/layout";

describe("clampPreviewPanelPercent", () => {
  it("keeps a dragged preview between readable and usable bounds", () => {
    expect(clampPreviewPanelPercent(10)).toBe(30);
    expect(clampPreviewPanelPercent(54)).toBe(54);
    expect(clampPreviewPanelPercent(90)).toBe(75);
  });
});
