"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPrefs, updatePrefs, type NotificationPrefs } from "@/lib/admin-api";

type PrefsPatch = Partial<Omit<NotificationPrefs, "user_id" | "updated_at">>;

// =====================================================================
// queries
// =====================================================================

/**
 * Current admin's notification preferences. One row per user, auto-created
 * server-side on first fetch.
 */
export function useAdminPrefs() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-prefs"],
    enabled: !!isSignedIn,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchPrefs(getToken),
  });
}

// =====================================================================
// mutations
// =====================================================================

/**
 * Update notification toggles.
 *
 * Note: the backend returns the full prefs object; we merge the response
 * into the cache directly (no need to wait for a refetch). This makes
 * toggles feel instant even on slow connections.
 */
export function useUpdatePrefs() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<NotificationPrefs, Error, PrefsPatch>({
    mutationFn: (patch) => updatePrefs(getToken, patch),
    onSuccess: (data) => {
      // Optimistically seed the cache with the authoritative response
      qc.setQueryData(["admin-prefs"], data);
    },
    onError: () => {
      // If the update failed, refetch to snap back to server truth
      qc.invalidateQueries({ queryKey: ["admin-prefs"] });
    },
  });
}
