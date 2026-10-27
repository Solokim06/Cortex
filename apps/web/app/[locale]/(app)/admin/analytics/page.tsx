"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { BarChart3, RefreshCw, Download } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { RangePicker } from "@/components/admin/analytics/RangePicker";
import { StatRow } from "@/components/admin/analytics/StatRow";
import { TicketsOverTimeChart } from "@/components/admin/analytics/TicketsOverTimeChart";
import { BreakdownChart } from "@/components/admin/analytics/BreakdownChart";
import { AtRiskTable } from "@/components/admin/analytics/AtRiskTable";
import type { DateRange } from "@/lib/hooks/use-admin-analytics";
import { useQueryClient } from "@tanstack/react-query";

export default function AnalyticsPage() {
  const t = useTranslations("admin.analytics");
  const [range, setRange] = useState<DateRange>({ days: 30 });
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();

  const rangeLabel =
    range.from && range.to
      ? `${range.from} → ${range.to}`
      : range.days === 1
        ? t("range_today")
        : t("range_last_days", { n: range.days ?? 30 });

  const handleRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["admin-analytics-overview"] });
    await qc.invalidateQueries({ queryKey: ["admin-analytics-timeseries"] });
    await qc.invalidateQueries({ queryKey: ["admin-analytics-breakdown"] });
    await qc.invalidateQueries({ queryKey: ["admin-analytics-at-risk"] });
    setRefreshing(false);
    toast.success(t("refresh_toast"));
  };

  const handleExport = () => {
    // Reuse the existing export endpoint with the current date range.
    // It returns CSV. We open in a new tab which triggers download.
    const qs = new URLSearchParams();
    if (range.from && range.to) {
      qs.set("from", range.from);
      qs.set("to", range.to);
    } else if (range.days) {
      qs.set("days", String(range.days));
    }
    // We don't have the range params on the export endpoint — fall
    // back to opening the standard export. Extending export with
    // range filters is a future improvement.
    window.open("/admin/tickets/export?fmt=csv", "_blank");
    toast.info(t("export_toast"));
  };

  return (
    <div className="px-5 py-5 max-w-6xl space-y-4">
      {/* Header row: title + range picker + actions */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/10 p-1.5">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              {t("title")}
            </h1>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {rangeLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <RangePicker value={range} onChange={setRange} />

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]",
              "border border-border bg-background hover:bg-accent/40 transition-colors",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
            title={t("refresh_aria")}
          >
            <RefreshCw
              className={cn("w-3 h-3", refreshing && "animate-spin")}
            />
            {t("refresh")}
          </button>

          <button
            type="button"
            onClick={handleExport}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]",
              "border border-border bg-background hover:bg-accent/40 transition-colors",
            )}
            title={t("export_aria")}
          >
            <Download className="w-3 h-3" />
            {t("export")}
          </button>
        </div>
      </div>

      {/* Stats row — 6 tiles */}
      <StatRow range={range} />

      {/* Charts — 2:1 layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <TicketsOverTimeChart range={range} />
        </div>
        <div>
          <BreakdownChart range={range} />
        </div>
      </div>

      {/* At-risk table — full width */}
      <AtRiskTable />

      {/* Footnote */}
      <p className="text-[10px] text-muted-foreground text-center pt-2">
        {t("footer_hint")}
      </p>
    </div>
  );
}
