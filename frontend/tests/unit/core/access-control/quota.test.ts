import { describe, expect, it } from "@rstest/core";

import {
  decrementQuota,
  isQuotaExhausted,
  shouldShowQuotaRemaining,
  type QuotaStatus,
} from "@/core/access-control/quota";

const limited: QuotaStatus = {
  quota_enabled: true,
  quota_period: "week",
  effective_limit: 2,
  remaining: 1,
};

describe("quota status", () => {
  it("shows remaining quota only for an empty regular-user composer", () => {
    expect(shouldShowQuotaRemaining(limited, "user", "")).toBe(true);
    expect(shouldShowQuotaRemaining(limited, "user", "question")).toBe(false);
    expect(shouldShowQuotaRemaining(limited, "admin", "")).toBe(false);
    expect(
      shouldShowQuotaRemaining(
        { ...limited, quota_enabled: false },
        "user",
        "",
      ),
    ).toBe(false);
  });

  it("blocks immediately only when an enabled quota is exhausted", () => {
    expect(isQuotaExhausted({ ...limited, remaining: 0 })).toBe(true);
    expect(
      isQuotaExhausted({ ...limited, quota_enabled: false, remaining: 0 }),
    ).toBe(false);
    expect(isQuotaExhausted({ ...limited, remaining: null })).toBe(false);
  });

  it("optimistically decrements a limited quota without going below zero", () => {
    expect(decrementQuota(limited)?.remaining).toBe(0);
    expect(decrementQuota({ ...limited, remaining: 0 })?.remaining).toBe(0);
    expect(
      decrementQuota({ ...limited, remaining: null })?.remaining,
    ).toBeNull();
  });
});
