"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWebhook,
  deleteWebhook,
  fetchWebhookDeliveries,
  fetchWebhooks,
  testWebhook,
  triggerWebhookRetry,
  updateWebhook,
  type WebhookDelivery,
  type WebhookTarget,
} from "@/lib/admin-api";

// =====================================================================
// queries
// =====================================================================

/**
 * All webhook targets. Cached 30s.
 */
export function useWebhooks() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-webhooks"],
    enabled: !!isSignedIn,
    staleTime: 30_000,
    queryFn: () => fetchWebhooks(getToken),
  });
}

/**
 * Delivery history for one target. Fetched lazily — only when a
 * consumer opens the drawer for that target.
 */
export function useWebhookDeliveries(targetId: string | null) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-webhook-deliveries", targetId],
    enabled: !!isSignedIn && !!targetId,
    staleTime: 10_000,
    queryFn: () => fetchWebhookDeliveries(getToken, targetId!),
  });
}

// =====================================================================
// mutations
// =====================================================================

function invalidateWebhookRelated(
  qc: ReturnType<typeof useQueryClient>,
  targetId?: string,
) {
  qc.invalidateQueries({ queryKey: ["admin-webhooks"] });
  if (targetId) {
    qc.invalidateQueries({ queryKey: ["admin-webhook-deliveries", targetId] });
  }
  // Failed delivery counts show on the admin health panel.
  qc.invalidateQueries({ queryKey: ["admin-health"] });
}

export function useCreateWebhook() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<
    WebhookTarget,
    Error,
    { name: string; url: string; events?: string[]; secret?: string }
  >({
    mutationFn: (payload) => createWebhook(getToken, payload),
    onSuccess: () => invalidateWebhookRelated(qc),
  });
}

export function useUpdateWebhook() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<
    WebhookTarget,
    Error,
    {
      id: string;
      name?: string;
      url?: string;
      events?: string[];
      secret?: string;
      is_active?: boolean;
    }
  >({
    mutationFn: ({ id, ...patch }) => updateWebhook(getToken, id, patch),
    onSuccess: (_data, vars) => invalidateWebhookRelated(qc, vars.id),
  });
}

export function useDeleteWebhook() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (id) => deleteWebhook(getToken, id),
    onSuccess: () => invalidateWebhookRelated(qc),
  });
}

/**
 * Send a synthetic "ping" event to a webhook target. Use to validate
 * setup before wiring it to real events.
 */
export function useTestWebhook() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<WebhookDelivery, Error, string>({
    mutationFn: (targetId) => testWebhook(getToken, targetId),
    onSuccess: (_data, targetId) => invalidateWebhookRelated(qc, targetId),
  });
}

/**
 * Manually run the retry worker — retries any failed deliveries that
 * are due for another attempt.
 */
export function useTriggerWebhookRetry() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => triggerWebhookRetry(getToken),
    onSuccess: () => {
      // Delivery statuses + failure counts change after a retry pass
      qc.invalidateQueries({ queryKey: ["admin-webhooks"] });
      qc.invalidateQueries({ queryKey: ["admin-webhook-deliveries"] });
      qc.invalidateQueries({ queryKey: ["admin-health"] });
    },
  });
}
