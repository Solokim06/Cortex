"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

export type DateRange = {
  /** Preset days count (ignored if from/to are set) */
  days?: number;
  /** ISO YYYY-MM-DD */
  from?: string;
  /** ISO YYYY-MM-DD */
  to?: string;
};

export type OverviewResponse = {
  range: { start: string; end: string; days: number };
  counts: {
    total: number;
    created_in_range: number;
    resolved_in_range: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
  };
  times: {
    median_first_response_minutes: number | null;
    p95_first_response_minutes: number | null;
    median_resolution_minutes: number | null;
    p95_resolution_minutes: number | null;
  };
  sla: {
    compliance_pct: number | null;
    breached_open: number;
    met_in_range: number;
    breached_in_range: number;
  };
};

export type TimeseriesBucket = {
  date: string;
  created: number;
  resolved: number;
};

export type BreakdownKey = { key: string; count: number };

export type BreakdownResponse = {
  by_category: BreakdownKey[];
  by_priority: BreakdownKey[];
  by_tag: BreakdownKey[];
};

export type AtRiskTicket = {
  ticket_id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  sla_category: "first_response" | "resolution";
  due_at: string | null;
  seconds_remaining: number | null;
  assignee_email: string | null;
  assignee_name: string | null;
};

// =====================================================================
// helpers
// =====================================================================

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function fetchJson<T>(
  path: string,
  getToken: () => Promise<string | null>,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const resp = await fetch(`${API_BASE}${path}`, {
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
  return (await resp.json()) as T;
}

function rangeKey(range: DateRange): [number | null, string | null, string | null] {
  // Deterministic cache key from the range object
  return [range.days ?? null, range.from ?? null, range.to ?? null];
}

// =====================================================================
// hooks
// =====================================================================

export function useAnalyticsOverview(range: DateRange) {
  const { getToken, isSignedIn } = useAuth();
  const [days, from, to] = rangeKey(range);

  return useQuery({
    queryKey: ["admin-analytics-overview", days, from, to],
    enabled: !!isSignedIn,
    staleTime: 60_000,
    queryFn: () =>
      fetchJson<OverviewResponse>(
        `/admin/analytics/overview${buildQuery({
          days: days ?? undefined,
          from: from ?? undefined,
          to: to ?? undefined,
        })}`,
        getToken,
      ),
  });
}

export function useAnalyticsTimeseries(range: DateRange) {
  const { getToken, isSignedIn } = useAuth();
  const [days, from, to] = rangeKey(range);

  return useQuery({
    queryKey: ["admin-analytics-timeseries", days, from, to],
    enabled: !!isSignedIn,
    staleTime: 60_000,
    queryFn: () =>
      fetchJson<TimeseriesBucket[]>(
        `/admin/analytics/timeseries${buildQuery({
          days: days ?? undefined,
          from: from ?? undefined,
          to: to ?? undefined,
        })}`,
        getToken,
      ),
  });
}

export function useAnalyticsBreakdown(range: DateRange) {
  const { getToken, isSignedIn } = useAuth();
  const [days, from, to] = rangeKey(range);

  return useQuery({
    queryKey: ["admin-analytics-breakdown", days, from, to],
    enabled: !!isSignedIn,
    staleTime: 60_000,
    queryFn: () =>
      fetchJson<BreakdownResponse>(
        `/admin/analytics/breakdown${buildQuery({
          days: days ?? undefined,
          from: from ?? undefined,
          to: to ?? undefined,
        })}`,
        getToken,
      ),
  });
}

export function useAnalyticsAtRisk(withinMinutes: number = 60) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-analytics-at-risk", withinMinutes],
    enabled: !!isSignedIn,
    staleTime: 30_000,
    queryFn: () =>
      fetchJson<AtRiskTicket[]>(
        `/admin/analytics/at-risk?within_minutes=${withinMinutes}`,
        getToken,
      ),
  });
}

// =====================================================================
// helpers used by charts + UI
// =====================================================================

/** Human label for a date range object. */
export function describeRange(range: DateRange): string {
  if (range.from && range.to) {
    return `${range.from} → ${range.to}`;
  }
  if (range.days === 1) return "Today";
  if (range.days != null) return `Last ${range.days} days`;
  return "Last 30 days";
}

/** Format a minutes count as "3h 12m" / "45m" / "2d 4h". */
export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "<1m";
  if (min < 60) return `${Math.round(min)}m`;
  const hours = Math.floor(min / 60);
  const rem = Math.round(min % 60);
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

/**
 * Format seconds-remaining as a localized countdown.
 *
 * `t` should be scoped to a namespace that has `countdown_due_in`,
 * `countdown_overdue`, and `countdown_now`.
 *
 * The duration label itself is passed to the translator as `{duration}`
 * so each language can place it in the right position.
 */
export function formatSlaCountdown(
  seconds: number | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (seconds === null || seconds === undefined) return "—";
  const abs = Math.abs(seconds);
  if (abs < 60) return t("countdown_now");
  const label = formatMinutes(abs / 60);
  return seconds >= 0
    ? t("countdown_due_in", { duration: label })
    : t("countdown_overdue", { duration: label });
}
