"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  type TooltipProps,
} from "recharts";
import { Loader2, BarChart3 } from "lucide-react";
import { cn } from "cn";
import {
  useAnalyticsBreakdown,
  type BreakdownKey,
  type DateRange,
} from "@/lib/hooks/use-admin-analytics";

// =====================================================================
// tabs
// =====================================================================

type TabKey = "category" | "priority" | "tag";

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: "category", labelKey: "chart_tab_category" },
  { key: "priority", labelKey: "chart_tab_priority" },
  { key: "tag", labelKey: "chart_tab_tag" },
];

// Palette per tab — each key gets a consistent color
const PALETTES: Record<TabKey, Record<string, string>> = {
  category: {
    bug: "#ef4444",
    feature: "#8b5cf6",
    question: "#0ea5e9",
    other: "#737373",
  },
  priority: {
    urgent: "#ef4444",
    high: "#f97316",
    normal: "#737373",
    low: "#a3a3a3",
  },
  // Tags fall back to a cycling palette
  tag: {},
};

const TAG_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#a3e635",
  "#6366f1",
  "#f43f5e",
];

function colorFor(tab: TabKey, key: string, index: number): string {
  if (tab === "tag") {
    return TAG_COLORS[index % TAG_COLORS.length];
  }
  return PALETTES[tab][key] ?? "#737373";
}

// =====================================================================
// tooltip
// =====================================================================

function BarTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-border bg-popover shadow-lg px-3 py-2 text-xs">
      <p className="font-medium capitalize mb-0.5">{p.payload?.key}</p>
      <p className="text-muted-foreground tabular-nums">
        {p.value} ticket{p.value === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// =====================================================================
// component
// =====================================================================

type Props = {
  range: DateRange;
};

export function BreakdownChart({ range }: Props) {
  const t = useTranslations("admin.analytics");
  const [tab, setTab] = useState<TabKey>("category");
  const query = useAnalyticsBreakdown(range);

  const buckets: BreakdownKey[] = (() => {
    if (!query.data) return [];
    if (tab === "category") return query.data.by_category;
    if (tab === "priority") return query.data.by_priority;
    return query.data.by_tag;
  })();

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="rounded-md bg-primary/10 p-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
        </div>
        <h3 className="text-sm font-medium min-w-0 flex-1">{t("chart_breakdown")}</h3>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/30 border border-border/60">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              type="button"
              onClick={() => setTab(tabItem.key)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap",
                tab === tabItem.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tabItem.labelKey as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {query.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-10">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading…
        </div>
      )}

      {query.isError && (
        <div className="px-4 py-6 text-xs text-rose-500">
          Couldn&apos;t load breakdown.
        </div>
      )}

      {!query.isLoading && !query.isError && buckets.length === 0 && (
        <div className="px-4 py-12 text-center text-xs text-muted-foreground">
          No data in this range.
        </div>
      )}

      {!query.isLoading && !query.isError && buckets.length > 0 && (
        <BarBody tab={tab} buckets={buckets} />
      )}
    </div>
  );
}

// =====================================================================
// bar body
// =====================================================================

function BarBody({ tab, buckets }: { tab: TabKey; buckets: BreakdownKey[] }) {
  return (
    <div className="px-2 pt-3 pb-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={buckets}
            layout="vertical"
            margin={{ top: 4, right: 20, left: 8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              horizontal={false}
            />
            <XAxis
              type="number"
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="key"
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.75)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              width={76}
              tickFormatter={(v) =>
                String(v).length > 12 ? `${String(v).slice(0, 12)}…` : String(v)
              }
            />
            <Tooltip
              content={<BarTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              barSize={16}
            >
              {buckets.map((b, i) => (
                <Cell
                  key={b.key}
                  fill={colorFor(tab, b.key, i)}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
