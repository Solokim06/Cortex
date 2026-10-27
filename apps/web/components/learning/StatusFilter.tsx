"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { GoalStatus } from "@/lib/hooks/use-learning";

export type StatusKey = "all" | GoalStatus;

type FilterSpec = {
  key: StatusKey;
  labelKey: "all" | "active" | "completed" | "paused";
};

const FILTERS: FilterSpec[] = [
  { key: "all", labelKey: "all" },
  { key: "active", labelKey: "active" },
  { key: "completed", labelKey: "completed" },
  { key: "paused", labelKey: "paused" },
];

type Props = {
  value: StatusKey;
  onChange: (v: StatusKey) => void;
  counts?: Partial<Record<StatusKey, number>>;
};

export function StatusFilter({ value, onChange, counts }: Props) {
  const t = useTranslations("learning.statusFilter");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((f) => {
        const count = counts?.[f.key];
        const isActive = value === f.key;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5",
              isActive
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={isActive}
          >
            {t(f.labelKey)}
            {typeof count === "number" && (
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  isActive ? "text-primary/80" : "text-muted-foreground",
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
