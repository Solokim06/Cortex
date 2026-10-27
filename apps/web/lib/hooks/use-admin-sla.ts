"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSlaPolicies,
  triggerSlaScan,
  updateSlaPolicy,
  type SlaPolicy,
  type TicketPriority,
} from "@/lib/admin-api";

// =====================================================================
// queries
// =====================================================================

/**
 * All SLA policies (one per priority). Cached 5min — changes are rare
 * and the values only take effect for newly created tickets.
 */
export function useSlaPolicies() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-sla-policies"],
    enabled: !!isSignedIn,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchSlaPolicies(getToken),
  });
}

// =====================================================================
// mutations
// =====================================================================

function invalidateSlaRelated(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin-sla-policies"] });
  // Changing SLA policy doesn't retroactively affect existing tickets,
  // but the near-breach / breach counts on stats are computed live, so
  // force a stats refresh to keep them coherent.
  qc.invalidateQueries({ queryKey: ["admin-stats"] });
}

export function useUpdateSlaPolicy() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<
    Pick<SlaPolicy, "priority" | "first_response_minutes" | "resolution_minutes">,
    Error,
    {
      priority: TicketPriority;
      firstResponseMinutes: number;
      resolutionMinutes: number;
    }
  >({
    mutationFn: ({ priority, firstResponseMinutes, resolutionMinutes }) =>
      updateSlaPolicy(getToken, priority, firstResponseMinutes, resolutionMinutes),
    onSuccess: () => invalidateSlaRelated(qc),
  });
}

export function useTriggerSlaScan() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => triggerSlaScan(getToken),
    onSuccess: () => {
      // Breach counts change after a scan
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}
