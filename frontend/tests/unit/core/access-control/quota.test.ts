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
        "{period} questions remaining: {count}",
        "Unlimited",
        {
          day: "Today",
          week: "This week",
          month: "This month",
          year: "This year",
        },
      ),
    ).toBe("How can I help?（This week questions remaining: 1）");
    expect(
      buildQuotaPlaceholder(
        limited,
        "admin",
        "How can I help?",
        "{period} questions remaining: {count}",
        "Unlimited",
        {
          day: "Today",
          week: "This week",
          month: "This month",
          year: "This year",
        },
      ),
    ).toBe("How can I help?");
    expect(
      buildQuotaPlaceholder(
        { ...limited, remaining: null },
        "user",
        "How can I help?",
        "{period} questions remaining: {count}",
        "Unlimited",
        {
          day: "Today",
          week: "This week",
          month: "This month",
          year: "This year",
        },
      ),
    ).toBe("How can I help?（This week questions remaining: Unlimited）");
  });

  it.each([
    ["day", "本日"],
    ["week", "本周"],
    ["month", "本月"],
    ["year", "本年"],
  ] as const)("uses the authorized %s period label", (quotaPeriod, label) => {
    expect(
      buildQuotaPlaceholder(
        { ...limited, quota_period: quotaPeriod },
        "user",
        "今天我能为你做些什么？",
        "{period}剩余问答次数：{count}",
        "不限",
        { day: "本日", week: "本周", month: "本月", year: "本年" },
      ),
    ).toBe(`今天我能为你做些什么？（${label}剩余问答次数：1）`);
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
