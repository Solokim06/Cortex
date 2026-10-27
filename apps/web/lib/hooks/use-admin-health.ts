"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type HealthStatus =
  | "operational"
  | "degraded"
  | "down"
  | "unknown";

export type HealthComponent = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  latency_ms: number | null;
  provider: string | null;
};

export type DataHealth = {
  users: number;
  tickets: number;
  events: number;
  email_deliveries: number;
  webhook_deliveries: number;
  oldest_event_age_days: number | null;
  oldest_ticket_age_days: number | null;
};

export type PubsubInfo = {
  mode: string;
  subscribers: number;
};

export type RecentFailure = {
  kind: "email" | "webhook";
  id: string;
  target: string;
  template?: string;
  event_kind?: string;
  status_code?: number | null;
  error: string;
  at: string | null;
};

export type SlaHealth = {
  breached_open: number;
  open_total: number;
};

export type EnvInfo = {
  email_enabled: boolean;
  email_provider: string;
  embedding_provider: string;
  help_rate_limit_max: number;
  webhook_max_attempts: number;
  impersonation_ttl_minutes: number;
  admin_emails_configured: boolean;
  agent_emails_configured: boolean;
};

export type DetailedHealth = {
  generated_at: string;
  probes: { overall: HealthStatus; components: HealthComponent[] } | { error: string };
  data_health: DataHealth | { error: string };
  pubsub: PubsubInfo | { error: string };
  recent_failures: RecentFailure[] | { error: string };
  sla: SlaHealth | { error: string };
  env: EnvInfo;
};

// =====================================================================
// hooks
// =====================================================================

/**
 * Detailed admin health snapshot. Polls every 30s.
 */
export function useDetailedHealth() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-health-detailed"],
    enabled: !!isSignedIn,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const resp = await fetch(`${API_BASE}/admin/health/detailed`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(
          (detail as { detail?: string }).detail ?? `HTTP ${resp.status}`,
        );
      }
      return (await resp.json()) as DetailedHealth;
    },
  });
}

// =====================================================================
// helpers
// =====================================================================

export function isError(v: unknown): v is { error: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    "error" in v &&
    typeof (v as { error: unknown }).error === "string"
  );
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

export function formatAge(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)} mo`;
  return `${Math.floor(days / 365)} yr`;
}
