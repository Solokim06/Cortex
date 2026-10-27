"use client";

import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  UserX,
  XCircle,
  Flame,
} from "lucide-react";
import { cn } from "cn";
import { useAdminStats } from "@/lib/hooks/use-admin-stats";
import { useAdminStream } from "@/lib/hooks/use-admin-stream";

/**
 * Stats counter strip for the top of the admin tickets page.
 *
 * Shows: total, open, in_progress, resolved, closed, unassigned_open,
 *        and sla_breached_open (highlighted in rose when > 0).
 *
 * Live-updates via SSE — any ticket.* event invalidates ["admin-stats"].
 */
export function StatsHeader() {
  const t = useTranslations("admin.tickets");
  const tStatus = useTranslations("admin.status");
  const { data, isLoading, isError } = useAdminStats();

  // Also refresh on live events even when the layout is not mounted
  // (defense in depth — the layout invalidates too).
  useAdminStream(true);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border text-xs text-rose-500">
        <AlertCircle className="w-3.5 h-3.5" />
        {t("stats_failed")}
      </div>
    );
  }

  const tiles: Array<{
    key: string;
    label: string;
    value: number;
    icon: typeof AlertCircle;
    tone: string;
    emphasize?: boolean;
  }> = [
    {
      key: "open",
      label: tStatus("open"),
      value: data.by_status.open,
      icon: AlertCircle,
      tone: "text-amber-500",
    },
    {
      key: "in_progress",
      label: tStatus("in_progress"),
      value: data.by_status.in_progress,
      icon: Clock,
      tone: "text-sky-500",
    },
    {
      key: "resolved",
      label: tStatus("resolved"),
      value: data.by_status.resolved,
      icon: CheckCircle2,
      tone: "text-emerald-500",
    },
    {
      key: "closed",
      label: tStatus("closed"),
      value: data.by_status.closed,
      icon: XCircle,
      tone: "text-muted-foreground",
    },
    {
      key: "unassigned",
      label: t("unassigned_stat"),
      value: data.unassigned_open,
      icon: UserX,
      tone: "text-violet-500",
    },
    {
      key: "breached",
      label: t("sla_breached_stat"),
      value: data.sla_breached_open,
      icon: Flame,
      tone:
        data.sla_breached_open > 0
          ? "text-rose-500"
          : "text-muted-foreground",
      emphasize: data.sla_breached_open > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 px-5 py-4 border-b border-border">
      <div className="col-span-2 sm:col-span-3 lg:col-span-6 flex items-center gap-2 mb-1">
        <h2 className="text-sm font-medium">{t("title")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("subtitle")}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t("total_count", { count: data.total })}
        </span>
      </div>
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.key}
            className={cn(
              "rounded-lg border border-border bg-card/40 px-3 py-2.5",
              "flex items-center gap-2.5 min-w-0",
              tile.emphasize && "border-rose-500/40 bg-rose-500/5",
            )}
          >
            <Icon className={cn("w-4 h-4 shrink-0", tile.tone)} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                {tile.label}
              </p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums leading-tight",
                  tile.emphasize && "text-rose-500",
                )}
              >
                {tile.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
