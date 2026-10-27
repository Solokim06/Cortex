"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ReflectionKind } from "@/lib/hooks/use-cortex";

export type KindKey = "all" | ReflectionKind;

type FilterSpec = {
  key: KindKey;
  labelKey:
    | "filterAll"
    | "filterLessons"
    | "filterReports"
    | "filterPatterns"
    | "filterIdentity";
};

const FILTERS: FilterSpec[] = [
  { key: "all", labelKey: "filterAll" },
  { key: "lesson", labelKey: "filterLessons" },
  { key: "weekly_report", labelKey: "filterReports" },
  { key: "pattern_insight", labelKey: "filterPatterns" },
  { key: "identity_update", labelKey: "filterIdentity" },
];

type Props = {
  value: KindKey;
  onChange: (v: KindKey) => void;
  counts?: Partial<Record<KindKey, number>>;
};

export function KindFilter({ value, onChange, counts }: Props) {
  const t = useTranslations("reflections.kindFilter");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((f) => {
        const count = counts?.[f.key];
        const active = value === f.key;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {t(f.labelKey)}
            {typeof count === "number" && (
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  active ? "text-primary/80" : "text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
