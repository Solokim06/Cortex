"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type TypeKey =
  | "all"
  | "thought"
  | "concept"
  | "reflection"
  | "decision";

type FilterSpec = {
  key: TypeKey;
  labelKey:
    | "filterAll"
    | "filterThoughts"
    | "filterConcepts"
    | "filterDecisions"
    | "filterReflections";
};

const FILTERS: FilterSpec[] = [
  { key: "all", labelKey: "filterAll" },
  { key: "thought", labelKey: "filterThoughts" },
  { key: "concept", labelKey: "filterConcepts" },
  { key: "decision", labelKey: "filterDecisions" },
  { key: "reflection", labelKey: "filterReflections" },
];

type Props = {
  value: TypeKey;
  onChange: (v: TypeKey) => void;
};

export function TypeFilter({ value, onChange }: Props) {
  const t = useTranslations("memory.typeFilter");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
            value === f.key
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={value === f.key}
        >
          {t(f.labelKey)}
        </button>
      ))}
    </div>
  );
}
