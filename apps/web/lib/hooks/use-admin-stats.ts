"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminStats } from "@/lib/admin-api";

/**
 * Dashboard counters. Polls every 30s so the header stays fresh
 * while an admin is viewing the list.
 */
export function useAdminStats() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-stats"],
    enabled: !!isSignedIn,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: () => fetchAdminStats(getToken),
  });
}
