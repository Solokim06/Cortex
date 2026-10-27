"use client";

import { useTranslations } from "next-intl";
import type { HealthTopology } from "@/lib/hooks/use-health";

export function TopologySection({ data }: { data: HealthTopology }) {
  const t = useTranslations("memory.health.topology");

  // Take the histogram, cap at 12 buckets for readability, merge the rest into "12+"
  const merged: { label: string; count: number }[] = [];
  const overflow = data.degree_histogram.filter((b) => b.degree >= 12);
  const within = data.degree_histogram.filter((b) => b.degree < 12);

  for (const b of within) {
    merged.push({ label: String(b.degree), count: b.count });
  }
  if (overflow.length > 0) {
    merged.push({
      label: "12+",
      count: overflow.reduce((s, b) => s + b.count, 0),
    });
  }

  const maxCount = Math.max(1, ...merged.map((m) => m.count));

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-semibold tracking-tight">
          {t("title")}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {t("edgeDensity", { value: data.edge_density.toFixed(2) })}
        </div>
      </div>

      {merged.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-6 text-center">
          {t("empty")}
        </div>
      ) : (
        <>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {t("degreeHistogram")}
          </div>
          <div className="space-y-1">
            {merged.map((b) => (
              <div
                key={b.label}
                className="flex items-center gap-2 text-[11px] tabular-nums"
              >
                <span className="w-8 text-right text-muted-foreground">
                  {b.label}
                </span>
                <div className="flex-1 h-4 rounded-sm bg-background/40 overflow-hidden">
                  <div
                    className="h-full bg-primary/50"
                    style={{
                      width: `${Math.max(2, (b.count / maxCount) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-10 text-right text-muted-foreground">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
