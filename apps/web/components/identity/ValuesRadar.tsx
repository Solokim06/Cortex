"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Value = {
  value: string;
  evidence: string;
  strength: string;
};

type Props = {
  values: Value[];
  loading?: boolean;
};

/** Map strength labels to numeric scores. */
function strengthScore(strength: string): number {
  const s = strength.toLowerCase();
  if (s === "high") return 1.0;
  if (s === "medium") return 0.7;
  if (s === "low") return 0.4;
  return 0.5;
}

/** Truncate long value names for the chart axes. */
function truncate(text: string, max = 18): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

type TooltipPayload = {
  payload?: {
    fullName: string;
    strength: string;
    evidence: string;
    score: number;
  };
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  const t = useTranslations("identity.valuesRadar");
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  if (!d) return null;

  return (
    <div className="max-w-[260px] rounded-md border border-border bg-card/95 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-xs font-semibold text-foreground">{d.fullName}</p>
      <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
        {t("tooltipStrength", {
          strength: d.strength,
          pct: Math.round(d.score * 100),
        })}
      </p>
      {d.evidence && (
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
          {d.evidence}
        </p>
      )}
    </div>
  );
}

export function ValuesRadar({ values, loading = false }: Props) {
  const t = useTranslations("identity.valuesRadar");
  // Take the top 6 values, keeping the shape readable
  const top = values.slice(0, 6);

  const chartData = top.map((v) => ({
    name: truncate(v.value),
    fullName: v.value,
    strength: v.strength,
    evidence: v.evidence,
    score: strengthScore(v.strength),
  }));

  const hasData = chartData.length >= 3; // Radar needs at least 3 axes

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Compass className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">{t("title")}</CardTitle>
          {top.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {t("topCount", { count: top.length })}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="h-[280px] bg-accent/20 rounded animate-pulse" />
        ) : !hasData ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              {values.length === 0
                ? t("emptyNoValues")
                : t("emptyNotEnough")}
            </p>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={chartData}
                margin={{ top: 10, right: 30, bottom: 10, left: 30 }}
                outerRadius="72%"
              >
                <PolarGrid
                  stroke="oklch(1 0 0 / 0.1)"
                  strokeDasharray="3 3"
                />
                <PolarAngleAxis
                  dataKey="name"
                  tick={{
                    fill: "oklch(0.64 0 0)",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                  tickLine={false}
                />
                <PolarRadiusAxis
                  domain={[0, 1]}
                  tick={false}
                  axisLine={false}
                  tickCount={4}
                />
                <Radar
                  name={t("seriesName")}
                  dataKey="score"
                  stroke="oklch(0.62 0.22 265)"
                  strokeWidth={2}
                  fill="oklch(0.62 0.22 265)"
                  fillOpacity={0.25}
                  dot={{
                    r: 3,
                    fill: "oklch(0.62 0.22 265)",
                    stroke: "oklch(0.62 0.22 265)",
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
