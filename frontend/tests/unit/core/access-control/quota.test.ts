import { describe, expect, it } from "@rstest/core";

import {
  buildQuotaPlaceholder,
  decrementQuota,
  isQuotaExhausted,
  type QuotaStatus,
} from "@/core/access-control/quota";

const limited: QuotaStatus = {
  quota_enabled: true,
  quota_period: "week",
  effective_limit: 2,
  remaining: 1,
};

describe("quota status", () => {
  it("appends a regular user's remaining quota to the placeholder", () => {
    expect(
      buildQuotaPlaceholder(
        limited,
        "user",
        "How can I help?",
        "Questions remaining: {count}",
        "Unlimited",
      ),
    ).toBe("How can I help?（Questions remaining: 1）");
    expect(
      buildQuotaPlaceholder(
        limited,
        "admin",
        "How can I help?",
        "Questions remaining: {count}",
        "Unlimited",
      ),
    ).toBe("How can I help?");
    expect(
      buildQuotaPlaceholder(
        { ...limited, remaining: null },
        "user",
        "How can I help?",
        "Questions remaining: {count}",
        "Unlimited",
      ),
    ).toBe("How can I help?（Questions remaining: Unlimited）");
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
