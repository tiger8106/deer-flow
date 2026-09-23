import { describe, expect, it } from "@rstest/core";
import { renderToStaticMarkup } from "react-dom/server";

import { getFileIcon } from "@/core/utils/files";

describe("Office-style artifact icons", () => {
  it("uses the colored PowerPoint badge for PPTX files", () => {
    const html = renderToStaticMarkup(
      getFileIcon("/mnt/user-data/outputs/图片转PPT.pptx", "size-6"),
    );

    expect(html).toContain(">P</span>");
    expect(html).toContain("bg-[#d24726]");
  });

  it("uses distinct colored badges for Word and Excel files", () => {
    const word = renderToStaticMarkup(getFileIcon("brief.docx", "size-6"));
    const excel = renderToStaticMarkup(getFileIcon("table.xlsx", "size-6"));

    expect(word).toContain(">W</span>");
    expect(word).toContain("bg-[#2b579a]");
    expect(excel).toContain(">X</span>");
    expect(excel).toContain("bg-[#217346]");
  });
});
