"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  type TooltipProps,
} from "recharts";
import { Loader2, TrendingUp } from "lucide-react";
import {
  useAnalyticsTimeseries,
  type DateRange,
  type TimeseriesBucket,
} from "@/lib/hooks/use-admin-analytics";

// =====================================================================
// helpers
// =====================================================================

function formatDateLabel(iso: string, days: number, locale: string): string {
  const d = new Date(iso);
  if (days > 60) {
    // Long ranges — monthly-ish, just month + day
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

// =====================================================================
// tooltip
// =====================================================================

function ChartTooltip({
  active,
  payload,
  label,
  locale,
}: TooltipProps<number, string> & {
  locale: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover shadow-lg px-3 py-2 text-xs">
      <p className="font-medium mb-1">
        {new Date(label as string).toLocaleDateString(locale, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular-nums">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ background: p.color }}
          />
          <span className="capitalize text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// component
// =====================================================================

type Props = {
  range: DateRange;
};

export function TicketsOverTimeChart({ range }: Props) {
  const t = useTranslations("admin.analytics");
  const locale = useLocale();
  const query = useAnalyticsTimeseries(range);

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <Header range={range} />

      {query.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-10">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("chart_loading")}
        </div>
      )}

      {query.isError && (
        <div className="px-4 py-6 text-xs text-rose-500">
          {t("chart_load_error")}
        </div>
      )}

      {query.data && query.data.length === 0 && (
        <div className="px-4 py-12 text-center text-xs text-muted-foreground">
          {t("chart_empty")}
        </div>
      )}

      {query.data && query.data.length > 0 && (
        <Chart data={query.data} days={range.days ?? 30} locale={locale} />
      )}
    </div>
  );
}

// =====================================================================
// header
// =====================================================================

function Header({ range }: { range: DateRange }) {
  const t = useTranslations("admin.analytics");
  const label =
    range.from && range.to
      ? `${range.from} → ${range.to}`
      : range.days === 1
        ? t("range_today")
        : t("range_last_n_days", { n: range.days ?? 30 });

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
      <div className="rounded-md bg-primary/10 p-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{t("chart_over_time")}</h3>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// =====================================================================
// chart body
// =====================================================================

function Chart({
  data,
  days,
  locale,
}: {
  data: TimeseriesBucket[];
  days: number;
  locale: string;
}) {
  const t = useTranslations("admin.analytics");
  const totalCreated = data.reduce((s, b) => s + b.created, 0);
  const totalResolved = data.reduce((s, b) => s + b.resolved, 0);

  return (
    <div className="px-2 pt-4 pb-2">
      {/* Quick summary above chart */}
      <div className="flex items-center gap-3 px-2 mb-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-sky-500" />
          {t("chart_summary_created")} ·{" "}
          <span className="tabular-nums text-foreground/80">{totalCreated}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" />
          {t("chart_summary_resolved")} ·{" "}
          <span className="tabular-nums text-foreground/80">{totalResolved}</span>
        </span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => formatDateLabel(v, days, locale)}
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              content={<ChartTooltip locale={locale} />}
              cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="square"
              iconSize={8}
            />
            <Line
              type="monotone"
              dataKey="created"
              name={t("chart_legend_created_short")}
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="resolved"
              name={t("chart_legend_resolved_short")}
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
