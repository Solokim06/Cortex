"use client";

import { useTranslations } from "next-intl";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Flame,
  Minus,
  XCircle,
  Bug,
  Sparkles,
  HelpCircle,
  Tag as TagIcon,
} from "lucide-react";
import { cn } from "cn";
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/lib/admin-api";

// =====================================================================
// status
// =====================================================================

const STATUS_META: Record<
  TicketStatus,
  { labelKey: string; icon: typeof AlertCircle; tone: string; dot: string }
> = {
  open: {
    labelKey: "open",
    icon: AlertCircle,
    tone: "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/5",
    dot: "bg-amber-500",
  },
  in_progress: {
    labelKey: "in_progress",
    icon: Clock,
    tone: "text-sky-600 dark:text-sky-400 border-sky-500/40 bg-sky-500/5",
    dot: "bg-sky-500",
  },
  resolved: {
    labelKey: "resolved",
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/5",
    dot: "bg-emerald-500",
  },
  closed: {
    labelKey: "closed",
    icon: XCircle,
    tone: "text-muted-foreground border-border bg-muted/30",
    dot: "bg-muted-foreground/60",
  },
};

export function StatusBadge({
  status,
  variant = "pill",
  className,
}: {
  status: TicketStatus;
  variant?: "pill" | "icon" | "dot";
  className?: string;
}) {
  const t = useTranslations("admin.status");
  const meta = STATUS_META[status];
  const label = t(meta.labelKey as Parameters<typeof t>[0]);
  const Icon = meta.icon;

  if (variant === "icon") {
    return (
      <div
        className={cn(
          "rounded-md border p-1.5 shrink-0 mt-0.5",
          meta.tone,
          className,
        )}
        aria-label={label}
      >
        <Icon className="w-3 h-3" />
      </div>
    );
  }

  if (variant === "dot") {
    return (
      <span
        className={cn("inline-block w-2 h-2 rounded-full", meta.dot, className)}
        aria-label={label}
      />
    );
  }

  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 inline-flex items-center gap-1",
        meta.tone,
        className,
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// =====================================================================
// priority
// =====================================================================

const PRIORITY_META: Record<
  TicketPriority,
  { labelKey: string; icon: typeof Flame; tone: string }
> = {
  urgent: {
    labelKey: "urgent",
    icon: Flame,
    tone: "text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/5",
  },
  high: {
    labelKey: "high",
    icon: AlertCircle,
    tone: "text-orange-600 dark:text-orange-400 border-orange-500/40 bg-orange-500/5",
  },
  normal: {
    labelKey: "normal",
    icon: Minus,
    tone: "text-muted-foreground border-border bg-muted/30",
  },
  low: {
    labelKey: "low",
    icon: Minus,
    tone: "text-muted-foreground border-border/60 bg-muted/20",
  },
};

export function PriorityBadge({
  priority,
  variant = "pill",
  className,
}: {
  priority: TicketPriority;
  variant?: "pill" | "icon";
  className?: string;
}) {
  const t = useTranslations("admin.priority");
  const meta = PRIORITY_META[priority];
  const label = t(meta.labelKey as Parameters<typeof t>[0]);
  const Icon = meta.icon;

  if (variant === "icon") {
    return (
      <Icon
        className={cn("w-3.5 h-3.5 shrink-0", meta.tone.split(" ")[0], className)}
        aria-label={label}
      />
    );
  }

  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 inline-flex items-center gap-1",
        meta.tone,
        className,
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// =====================================================================
// category
// =====================================================================

const CATEGORY_META: Record<
  TicketCategory,
  { labelKey: string; icon: typeof Bug; tone: string }
> = {
  bug: {
    labelKey: "bug",
    icon: Bug,
    tone: "text-rose-500/90",
  },
  feature: {
    labelKey: "feature",
    icon: Sparkles,
    tone: "text-violet-500/90",
  },
  question: {
    labelKey: "question",
    icon: HelpCircle,
    tone: "text-sky-500/90",
  },
  other: {
    labelKey: "other",
    icon: TagIcon,
    tone: "text-muted-foreground",
  },
};

export function CategoryBadge({
  category,
  showLabel = true,
  className,
}: {
  category: TicketCategory;
  showLabel?: boolean;
  className?: string;
}) {
  const t = useTranslations("admin.category");
  const meta = CATEGORY_META[category];
  const label = t(meta.labelKey as Parameters<typeof t>[0]);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "text-[10px] inline-flex items-center gap-1",
        meta.tone,
        className,
      )}
    >
      <Icon className="w-3 h-3" />
      {showLabel && <span>{label}</span>}
    </span>
  );
}

// =====================================================================
// SLA badge — derived from the SLA status object
// =====================================================================

export function SlaBadge({
  status,
  className,
}: {
  /**
   * "met" | "due_soon" | "breached" | "pending"
   * Callers compute this from the SLA object — see helpers below.
   */
  status: "met" | "due_soon" | "breached" | "pending";
  className?: string;
}) {
  const meta = {
    met: {
      label: "SLA met",
      tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/40",
    },
    due_soon: {
      label: "Due soon",
      tone: "text-amber-600 dark:text-amber-400 border-amber-500/40",
    },
    breached: {
      label: "SLA breached",
      tone: "text-rose-600 dark:text-rose-400 border-rose-500/40",
    },
    pending: {
      label: "Pending",
      tone: "text-muted-foreground border-border",
    },
  }[status];

  const label = meta.label;

  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 inline-flex items-center",
        meta.tone,
        className,
      )}
    >
      {label}
    </span>
  );
}

// =====================================================================
// helpers
// =====================================================================

/**
 * Human-friendly duration string: "3h 12m", "45s", "2d 4h", "-"
 */
/**
 * Human-friendly duration string, localized via the passed translator.
 * Falls back to a neutral dash when `seconds` is null/undefined.
 *
 * `t` should be scoped to `admin.tickets` (or any namespace that has
 * the duration_* keys).
 */
export function formatDuration(
  seconds: number | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (seconds === null || seconds === undefined) return t("no_date");
  const abs = Math.abs(seconds);
  if (abs < 60) return t("duration_seconds", { n: abs });
  const mins = Math.floor(abs / 60);
  if (mins < 60) return t("duration_minutes", { n: mins });
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return remMins
      ? t("duration_hours_mins", { n: hours, m: remMins })
      : t("duration_hours", { n: hours });
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours
    ? t("duration_days_hours", { n: days, m: remHours })
    : t("duration_days", { n: days });
}

/**
 * Relative time: "just now", "5m ago", "3h ago", "2d ago", or date.
 * Matches the style used elsewhere in Cortex (YourTickets).
 */
/**
 * Relative time, localized via the passed translator.
 * Falls back to a locale-aware date string beyond ~1 week.
 */
export function timeAgo(
  iso: string | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
  locale?: string,
): string {
  if (!iso) return t("no_date");
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("just_now");
  if (diff < 3600) return t("ago_minutes", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("ago_hours", { n: Math.floor(diff / 3600) });
  if (diff < 604800) return t("ago_days", { n: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString(locale);
}

/**
 * Collapse an SlaStatus object into a single badge status.
 * Priority order: breached > due_soon (within 1h) > met > pending.
 */
export function slaBadgeStatus(sla: {
  first_response: { breached: boolean; seconds_remaining: number | null; responded_at: string | null };
  resolution: { breached: boolean; seconds_remaining: number | null; resolved_at: string | null };
}): "met" | "due_soon" | "breached" | "pending" {
  if (sla.first_response.breached || sla.resolution.breached) return "breached";

  const frSecs = sla.first_response.seconds_remaining;
  const resSecs = sla.resolution.seconds_remaining;

  // If first response already happened and resolution is met, everything is met
  const frMet = sla.first_response.responded_at !== null;
  const resMet = sla.resolution.resolved_at !== null;

  const nearThreshold = 60 * 60; // 1 hour

  if (
    (!frMet && frSecs !== null && frSecs <= nearThreshold) ||
    (!resMet && resSecs !== null && resSecs <= nearThreshold)
  ) {
    return "due_soon";
  }

  if (frMet && resMet) return "met";
  if (frMet && resSecs !== null && resSecs > 0) return "pending";
  return "pending";
}
