"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminMe } from "@/lib/admin-api";

/**
 * Returns the current user's admin status.
 *
 * - isLoading: true while checking
 * - isAdmin: true if the API returned is_admin: true
 * - isAgent: true if role >= agent
 *
 * Fails gracefully: if the API returns 403 (non-admin), we cache the
 * result as { is_admin: false } so the nav doesn't flicker.
 */
export function useAdminMe() {
  const { getToken, isSignedIn } = useAuth();

  const query = useQuery({
    queryKey: ["admin-me"],
    enabled: !!isSignedIn,
    staleTime: 5 * 60 * 1000, // 5 min — role changes are rare
    retry: false, // don't retry 403s
    queryFn: async () => {
      try {
        return await fetchAdminMe(getToken);
      } catch (e: unknown) {
        // 403 = not an admin. Treat as a valid "no admin" response.
        const status = (e as { status?: number })?.status;
        if (status === 403) {
          return {
            id: "",
            email: "",
            name: null,
            role: "user" as const,
            is_admin: false,
            is_agent: false,
            impersonating: null,
          };
        }
        throw e;
      }
    },
  });

  return {
    ...query,
    data: query.data ?? null,
    isAdmin: !!query.data?.is_admin,
    isAgent: !!query.data?.is_agent,
  };
}
