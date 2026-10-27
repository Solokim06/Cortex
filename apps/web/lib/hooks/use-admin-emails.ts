"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type EmailPrefs = {
  enabled: boolean;
  updated_at: string | null;
  updated_by_user_id: string | null;
  provider: "resend" | "smtp" | "console" | "disabled";
  from_address: string;
  reply_to: string | null;
  max_attempts: number;
  retry_base_seconds: number;
  configured: boolean;
};

export type EmailDelivery = {
  id: string;
  to: string;
  template: string;
  subject: string;
  ticket_id: string | null;
  status: "queued" | "sending" | "sent" | "failed" | "suppressed";
  provider: string;
  message_id: string | null;
  error: string | null;
  attempt: number;
  created_at: string | null;
  sent_at: string | null;
};

export type EmailStats = {
  provider: string;
  last_30_days: {
    sent: number;
    failed: number;
    suppressed: number;
  };
  retry_queue: number;
};

export type EmailSuppression = {
  email: string;
  reason: string;
  note: string | null;
  created_at: string | null;
};

export type EmailTemplate =
  | "new_ticket"
  | "assignment"
  | "user_reply"
  | "sla_breach";

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  "new_ticket",
  "assignment",
  "user_reply",
  "sla_breach",
];

// =====================================================================
// fetchers
// =====================================================================

async function _fetchJson<T>(
  path: string,
  getToken: () => Promise<string | null>,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${resp.status}`,
    );
  }
  return (await resp.json()) as T;
}

// =====================================================================
// queries
// =====================================================================

export function useEmailPrefs() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["admin-email-prefs"],
    enabled: !!isSignedIn,
    staleTime: 15_000,
    queryFn: () =>
      _fetchJson<EmailPrefs>("/admin/emails/prefs", getToken),
  });
}

export function useEmailStats() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["admin-email-stats"],
    enabled: !!isSignedIn,
    staleTime: 30_000,
    queryFn: () =>
      _fetchJson<EmailStats>("/admin/emails/stats", getToken),
  });
}

export function useEmailDeliveries(params: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const { getToken, isSignedIn } = useAuth();

  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  qs.set("limit", String(params.limit ?? 50));
  // The backend doesn't currently support offset — it returns the most
  // recent N. We fetch limit+1 and slice client-side for pagination.
  const limit = (params.limit ?? 50) + 1;

  return useQuery({
    queryKey: ["admin-email-deliveries", params.status, limit],
    enabled: !!isSignedIn,
    staleTime: 10_000,
    queryFn: () =>
      _fetchJson<EmailDelivery[]>(
        `/admin/emails/deliveries?${qs.toString()}`,
        getToken,
      ),
  });
}

export function useEmailSuppressions() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["admin-email-suppressions"],
    enabled: !!isSignedIn,
    staleTime: 30_000,
    queryFn: () =>
      _fetchJson<EmailSuppression[]>(
        "/admin/emails/suppressions",
        getToken,
      ),
  });
}

// =====================================================================
// mutations
// =====================================================================

function invalidateEmailRelated(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin-email-prefs"] });
  qc.invalidateQueries({ queryKey: ["admin-email-stats"] });
  qc.invalidateQueries({ queryKey: ["admin-email-deliveries"] });
  qc.invalidateQueries({ queryKey: ["admin-email-suppressions"] });
  qc.invalidateQueries({ queryKey: ["admin-health"] });
}

export function useSetEmailEnabled() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) =>
      _fetchJson<{
        enabled: boolean;
        updated_at: string;
        updated_by_user_id: string | null;
      }>("/admin/emails/prefs", getToken, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => invalidateEmailRelated(qc),
  });
}

export function useSendTestEmail() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: { to: string; template: EmailTemplate }) =>
      _fetchJson<EmailDelivery>("/admin/emails/test", getToken, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => invalidateEmailRelated(qc),
  });
}

export function useTriggerEmailRetry() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      _fetchJson<{
        scanned: number;
        retried: number;
        succeeded: number;
        failed: number;
        skipped: number;
      }>("/admin/emails/retry-now", getToken, { method: "POST" }),
    onSuccess: () => invalidateEmailRelated(qc),
  });
}

export function useSuppressEmail() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      email: string;
      reason?: string;
      note?: string;
    }) =>
      _fetchJson<EmailSuppression>("/admin/emails/suppress", getToken, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => invalidateEmailRelated(qc),
  });
}

export function useUnsuppressEmail() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (email: string) =>
      _fetchJson<{ ok: boolean }>(
        `/admin/emails/suppressions/${encodeURIComponent(email)}`,
        getToken,
        { method: "DELETE" },
      ),
    onSuccess: () => invalidateEmailRelated(qc),
  });
}
