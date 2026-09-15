import { describe, expect, it, rs } from "@rstest/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createMarkdownLinkComponent } from "@/components/workspace/messages/markdown-link";

rs.mock("@/components/workspace/citations/citation-link", () => ({
  CitationLink: ({ children }: { children: string }) =>
    createElement("span", null, children),
}));

describe("Artifact download links", () => {
  it("makes delivered files conspicuous without changing external links", () => {
    const Link = createMarkdownLinkComponent("thread-example");
    const html = renderToStaticMarkup(
      createElement(
        Link,
        { href: "/mnt/user-data/outputs/deck.pptx" },
        "Download PPT",
      ),
    );
    expect(html).toContain('data-artifact-download="true"');
    expect(html).toContain("Download PPT");
    expect(html).toContain("<svg");
    const external = renderToStaticMarkup(
      createElement(Link, { href: "https://example.com" }, "Reference"),
    );
    expect(external).not.toContain("data-artifact-download");
    expect(external).toContain('href="https://example.com"');
  });
});
