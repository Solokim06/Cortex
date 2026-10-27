"use client";

import { useTranslations } from "next-intl";

import {
  Loader2,
  Inbox,
  CheckCircle2,
  Clock,
  MessageSquare,
  Flame,
  AlertTriangle,
} from "lucide-react";
import { cn } from "cn";
import {
  useAnalyticsOverview,
  formatMinutes,
  type DateRange,
  type OverviewResponse,
} from "@/lib/hooks/use-admin-analytics";

// =====================================================================
// tile definitions
// =====================================================================

type TileDef = {
  key: string;
  labelKey: string;
  icon: typeof Inbox;
  tone: string;
  /** Extract the display value from the response. */
  value: (data: OverviewResponse) => string;
  /** Subtitle under the value. */
  hint?: (data: OverviewResponse, t: (key: string, values?: Record<string, string | number>) => string) => string;
  /** When true, adds amber/rose highlight if the metric is bad. */
  emphasizeWhen?: (data: OverviewResponse) => boolean;
};

const TILES: TileDef[] = [
  {
    key: "created",
    labelKey: "created",
    icon: Inbox,
    tone: "text-sky-500",
    value: (d) => String(d.counts.created_in_range),
    hint: (_d, t) => t("stat_in_range"),
  },
  {
    key: "resolved",
    labelKey: "resolved",
    icon: CheckCircle2,
    tone: "text-emerald-500",
    value: (d) => String(d.counts.resolved_in_range),
    hint: (_d, t) => t("stat_in_range"),
  },
  {
    key: "median_fr",
    labelKey: "median_first_response",
    icon: Clock,
    tone: "text-primary",
    value: (d) => formatMinutes(d.times.median_first_response_minutes),
    hint: (d, t) =>
      d.times.p95_first_response_minutes !== null
        ? `p95 ${formatMinutes(d.times.p95_first_response_minutes)}`
        : t("stat_no_data"),
  },
  {
    key: "median_res",
    labelKey: "median_resolution",
    icon: MessageSquare,
    tone: "text-violet-500",
    value: (d) => formatMinutes(d.times.median_resolution_minutes),
    hint: (d, t) =>
      d.times.p95_resolution_minutes !== null
        ? `p95 ${formatMinutes(d.times.p95_resolution_minutes)}`
        : t("stat_no_data"),
  },
  {
    key: "sla",
    labelKey: "sla_compliance",
    icon: AlertTriangle,
    tone: "text-emerald-500",
    value: (d) =>
      d.sla.compliance_pct !== null
        ? `${d.sla.compliance_pct}%`
        : "—",
    hint: (d, t) =>
      d.sla.met_in_range + d.sla.breached_in_range > 0
        ? t("stat_met_breached", { met: d.sla.met_in_range, breached: d.sla.breached_in_range })
        : t("stat_no_closed"),
    emphasizeWhen: (d) =>
      d.sla.compliance_pct !== null && d.sla.compliance_pct < 90,
  },
  {
    key: "breached_open",
    labelKey: "open_breached",
    icon: Flame,
    tone: "text-rose-500",
    value: (d) => String(d.sla.breached_open),
    hint: (_d, t) => t("stat_right_now"),
    emphasizeWhen: (d) => d.sla.breached_open > 0,
  },
];

// =====================================================================
// component
// =====================================================================

type Props = {
  range: DateRange;
};

export function StatRow({ range }: Props) {
  const t = useTranslations("admin.analytics");
  const query = useAnalyticsOverview(range);

  if (query.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card/40 px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("stat_loading")}
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-5 py-4 text-xs text-rose-500">
        {t("stat_load_error")}
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {TILES.map((tile) => {
        const Icon = tile.icon;
        const emphasize = tile.emphasizeWhen?.(data) ?? false;
        const value = tile.value(data);
        const hint = tile.hint?.(data, t);

        return (
          <div
            key={tile.key}
            className={cn(
              "rounded-lg border border-border bg-card/40 px-3.5 py-3",
              "flex flex-col gap-1",
              emphasize && "border-rose-500/40 bg-rose-500/5",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon
                className={cn(
                  "w-3.5 h-3.5 shrink-0",
                  emphasize ? "text-rose-500" : tile.tone,
                )}
              />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                {t(tile.labelKey as Parameters<typeof t>[0])}
              </span>
            </div>

            <div
              className={cn(
                "text-2xl font-semibold tabular-nums leading-tight",
                emphasize && "text-rose-500",
              )}
            >
              {value}
            </div>

            {hint && (
              <div className="text-[10px] text-muted-foreground tabular-nums truncate">
                {hint}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
