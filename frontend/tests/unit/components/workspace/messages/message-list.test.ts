import { describe, expect, it } from "@rstest/core";

import { shouldScrollToLatestOnSubmit } from "@/components/workspace/messages/message-list";

describe("MessageList submission scrolling", () => {
  it("scrolls when a new submission starts", () => {
    expect(shouldScrollToLatestOnSubmit(false, true)).toBe(true);
  });

  it("does not retrigger while submitting or after completion", () => {
    expect(shouldScrollToLatestOnSubmit(true, true)).toBe(false);
    expect(shouldScrollToLatestOnSubmit(true, false)).toBe(false);
    expect(shouldScrollToLatestOnSubmit(false, false)).toBe(false);
  });
});
