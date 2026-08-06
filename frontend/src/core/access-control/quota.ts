import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetch } from "@/core/api/fetcher";

export type QuotaStatus = {
  quota_enabled: boolean;
  quota_period: "day" | "week" | "month" | "year";
  effective_mode?: "limited" | "unlimited" | "blocked";
  effective_limit: number | null;
  remaining: number | null;
  effective_source?: "global" | "role" | "user";
  effective_from?: string | null;
  expires_at?: string | null;
};

export const myQuotaQueryKey = ["access-control", "my-quota"] as const;

export function buildQuotaPlaceholder(
  status: QuotaStatus | undefined,
  systemRole: "admin" | "user" | undefined,
  placeholder: string,
  quotaRemaining: string,
  quotaUnlimited: string,
  quotaPeriodLabels: Record<QuotaStatus["quota_period"], string>,
  quotaWindowLabel = "Validity",
): string {
  if (systemRole !== "user" || status?.quota_enabled !== true) {
    return placeholder;
  }
  const periodLabel = status.effective_source && status.effective_source !== "global"
    ? status.effective_from || status.expires_at
      ? `${status.effective_from ?? quotaWindowLabel}—${status.expires_at ?? quotaWindowLabel}`
      : quotaWindowLabel
    : quotaPeriodLabels[status.quota_period];
  const remaining =
    status.remaining === null ? quotaUnlimited : String(status.remaining);
  const remainingLabel = quotaRemaining
    .replace("{period}", periodLabel)
    .replace("{count}", remaining);
  return `${placeholder}（${remainingLabel}）`;
}

export function isQuotaExhausted(status: QuotaStatus | undefined): boolean {
  return status?.effective_mode === "blocked" ||
    (status?.quota_enabled === true && status.remaining === 0);
}

export function decrementQuota(status: QuotaStatus | undefined) {
  if (!status?.quota_enabled || status.remaining === null) return status;
  return { ...status, remaining: Math.max(0, status.remaining - 1) };
}

async function fetchMyQuota(): Promise<QuotaStatus> {
  const response = await fetch("/api/access/api/v1/me/quota");
  if (!response.ok) {
    throw new Error("Failed to load quota status.");
  }
  return response.json() as Promise<QuotaStatus>;
}

export function useMyQuota(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: myQuotaQueryKey,
    queryFn: fetchMyQuota,
    enabled,
    refetchInterval: 5_000,
    staleTime: 2_000,
    retry: 1,
  });

  function consumeOptimistically() {
    queryClient.setQueryData<QuotaStatus>(myQuotaQueryKey, (current) => {
      return decrementQuota(current);
    });
    globalThis.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: myQuotaQueryKey });
    }, 1_000);
  }

  return { ...query, consumeOptimistically };
}
