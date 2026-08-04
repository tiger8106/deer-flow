import { describe, expect, it } from "@rstest/core";

import { getErrorDisplayMessage } from "@/core/api/error-message";

describe("getErrorDisplayMessage", () => {
  it("extracts a user-facing message from structured quota errors", () => {
    const error = new Error(
      'HTTP 429: {"detail":{"code":"quota_exhausted","message":"今日问答次数已用完","remaining":0}}',
    );

    expect(getErrorDisplayMessage(error)).toBe("今日问答次数已用完");
  });

  it("keeps ordinary transport messages unchanged", () => {
    expect(getErrorDisplayMessage(new Error("Network error"))).toBe(
      "Network error",
    );
  });
});
