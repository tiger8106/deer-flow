import { expect, test, rs } from "@rstest/core";

import {
  downloadPreviewFile,
  previewDownloadUrl,
} from "@/components/workspace/external-preview/controls";

test("embedded download metadata only accepts same-origin HTTP URLs", () => {
  const origin = "https://tiger.test";
  expect(previewDownloadUrl("/document?version=2&download=true", origin)).toBe(
    `${origin}/document?version=2&download=true`,
  );
  for (const value of [
    null,
    "",
    "javascript:alert(1)",
    "data:text/html,test",
    "https://other.test/file",
    "https://user:password@tiger.test/file",
    "//other.test/file",
  ])
    expect(previewDownloadUrl(value, origin)).toBeUndefined();
});

test("downloads click an attached download link without opening a new window", () => {
  const link = { href: "", download: "", click: rs.fn(), remove: rs.fn() };
  const appendChild = rs.fn();
  rs.stubGlobal("document", {
    createElement: () => link,
    body: { appendChild },
  });
  try {
    downloadPreviewFile("/download", "报告.pptx");
    expect(link.href).toBe("/download");
    expect(link.download).toBe("报告.pptx");
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    expect(link).not.toHaveProperty("target");
  } finally {
    rs.unstubAllGlobals();
  }
});
