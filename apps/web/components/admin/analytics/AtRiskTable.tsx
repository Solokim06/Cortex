"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Loader2,
  AlertTriangle,
  Flame,
  Clock,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { cn } from "cn";
import {
  useAnalyticsAtRisk,
  formatSlaCountdown,
  type AtRiskTicket,
} from "@/lib/hooks/use-admin-analytics";

// =====================================================================
// window selector
// =====================================================================

const WINDOW_OPTIONS = [
  { value: 30, labelKey: "at_risk_next_30m" },
  { value: 60, labelKey: "at_risk_next_1h" },
  { value: 240, labelKey: "at_risk_next_4h" },
  { value: 1440, labelKey: "at_risk_next_24h" },
  { value: 10080, labelKey: "at_risk_next_7d" },
];

// =====================================================================
// component
// =====================================================================

export function AtRiskTable() {
  const t = useTranslations("admin.analytics");
  const [withinMinutes, setWithinMinutes] = useState(1440);
  const query = useAnalyticsAtRisk(withinMinutes);

  const rows = query.data ?? [];

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 flex-wrap">
        <div className="rounded-md bg-rose-500/10 p-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t("at_risk_title")}</h3>
          <p className="text-[10px] text-muted-foreground">
            {t("at_risk_subtitle")}
          </p>
        </div>

        <select
          value={withinMinutes}
          onChange={(e) => setWithinMinutes(Number(e.target.value))}
          className={cn(
            "appearance-none px-2.5 py-1.5 text-[11px] rounded-md",
            "bg-background border border-border",
            "focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        >
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {query.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("at_risk_loading")}
        </div>
      )}

      {/* Error */}
      {query.isError && (
        <div className="px-4 py-6 text-xs text-rose-500">
          {t("at_risk_load_error")}
        </div>
      )}

      {/* Empty — good news */}
      {!query.isLoading && !query.isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <CheckCircle2 className="w-6 h-6 text-emerald-500/60" />
          <p className="text-xs">{t("at_risk_empty")}</p>
        </div>
      )}

      {/* Table */}
      {!query.isLoading && !query.isError && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-card/60">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("at_risk_col_ticket")}</th>
                <th className="px-3 py-2 font-medium">{t("at_risk_col_assignee")}</th>
                <th className="px-3 py-2 font-medium">SLA</th>
                <th className="px-3 py-2 font-medium text-right">{t("at_risk_col_time")}</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <Row key={`${r.ticket_id}-${r.sla_category}`} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// row
// =====================================================================

function Row({ row }: { row: AtRiskTicket }) {
  const t = useTranslations("admin.analytics");
  const isOverdue = (row.seconds_remaining ?? 0) < 0;
  const isImminent =
    !isOverdue && (row.seconds_remaining ?? Infinity) < 15 * 60; // <15 min

  const countdownLabel = formatSlaCountdown(row.seconds_remaining, t);

  // Priority tone
  const priorityTone: Record<string, string> = {
    urgent: "text-rose-500 border-rose-500/40 bg-rose-500/5",
    high: "text-orange-500 border-orange-500/40 bg-orange-500/5",
    normal: "text-muted-foreground border-border bg-muted/20",
    low: "text-muted-foreground border-border/60 bg-muted/10",
  };

  return (
    <tr className="hover:bg-accent/20 transition-colors">
      {/* Subject + meta */}
      <td className="px-4 py-2.5">
        <Link
          href={`/admin/tickets/${row.ticket_id}`}
          className="flex items-start gap-2 group min-w-0"
        >
          {isOverdue ? (
            <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          ) : (
            <Clock
              className={cn(
                "w-3.5 h-3.5 shrink-0 mt-0.5",
                isImminent ? "text-amber-500" : "text-muted-foreground",
              )}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium group-hover:text-foreground">
              {row.subject}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "text-[9px] uppercase tracking-wider rounded border px-1 py-0.5",
                  priorityTone[row.priority] ?? priorityTone.normal,
                )}
              >
                {row.priority}
              </span>
              <span className="text-[10px] text-muted-foreground capitalize">
                {row.category}
              </span>
            </div>
          </div>
        </Link>
      </td>

      {/* Assignee */}
      <td className="px-3 py-2.5 max-w-[180px]">
        {row.assignee_email ? (
          <span className="text-[11px] truncate block">
            {row.assignee_name || row.assignee_email}
          </span>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">
            {t("at_risk_unassigned")}
          </span>
        )}
      </td>

      {/* SLA category */}
      <td className="px-3 py-2.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {row.sla_category === "first_response"
            ? t("sla_cat_first_response")
            : row.sla_category === "resolution"
              ? t("sla_cat_resolution")
              : String(row.sla_category).replace("_", " ")}
        </span>
      </td>

      {/* Countdown */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span
          className={cn(
            "text-[11px] font-medium tabular-nums",
            isOverdue
              ? "text-rose-500"
              : isImminent
                ? "text-amber-500"
                : "text-muted-foreground",
          )}
        >
          {countdownLabel}
        </span>
      </td>

      {/* Open action */}
      <td className="px-3 py-2.5">
        <Link
          href={`/admin/tickets/${row.ticket_id}`}
          className="text-muted-foreground hover:text-foreground transition-colors inline-flex"
          aria-label={t("at_risk_open_ticket")}
        >
          <ExternalLink className="w-3 h-3" />
        </Link>
      </td>
    </tr>
  );
}
