"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { fetchAllTags } from "@/lib/admin-api";

/**
 * Every distinct tag currently in use, with counts. For filter chips.
 */
export function useAllTags() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-all-tags"],
    enabled: !!isSignedIn,
    staleTime: 60_000,
    queryFn: () => fetchAllTags(getToken),
  });
}
