import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetch } from "@/core/api/fetcher";

export type QuotaStatus = {
  quota_enabled: boolean;
  quota_period: "day" | "week" | "month" | "year";
  effective_limit: number | null;
  remaining: number | null;
};

export const myQuotaQueryKey = ["access-control", "my-quota"] as const;

export function buildQuotaPlaceholder(
  status: QuotaStatus | undefined,
  systemRole: "admin" | "user" | undefined,
  placeholder: string,
  quotaRemaining: string,
  quotaUnlimited: string,
): string {
  if (systemRole !== "user" || status?.quota_enabled !== true) {
    return placeholder;
  }
  const remaining =
    status.remaining === null ? quotaUnlimited : String(status.remaining);
  return `${placeholder}（${quotaRemaining.replace("{count}", remaining)}）`;
}

export function isQuotaExhausted(status: QuotaStatus | undefined): boolean {
  return status?.quota_enabled === true && status.remaining === 0;
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
