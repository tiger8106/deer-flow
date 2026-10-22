import { expect, test, rs } from "@rstest/core";
import type { MouseEvent } from "react";

const open = rs.fn();
rs.mock("@/components/workspace/external-preview/context", () => ({
  useMaybeExternalPreview: () => ({ open }),
}));

import { PreviewLink } from "@/components/workspace/external-preview/preview-link";

test("source-only links open the pane even when a caller requests a new tab", () => {
  const href =
    "/knowledge/citation-preview?preview=side-panel&title=book.xlsx&sheet=s_bank&page=3";
  const element = PreviewLink({ href, target: "_blank", children: "来源文件" });
  expect(element.props.target).toBeUndefined();
  const event = {
    defaultPrevented: false,
    preventDefault: rs.fn(),
    stopPropagation: rs.fn(),
  };
  element.props.onClick(event as unknown as MouseEvent<HTMLAnchorElement>);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith({ url: href, title: "book.xlsx" });
});

test("external websites retain their original new-tab behavior", () => {
  const element = PreviewLink({
    href: "https://example.com",
    target: "_blank",
  });
  expect(element.props.target).toBe("_blank");
  const preventDefault = rs.fn();
  element.props.onClick({
    defaultPrevented: false,
    preventDefault,
  } as unknown as MouseEvent<HTMLAnchorElement>);
  expect(preventDefault).not.toHaveBeenCalled();
});
