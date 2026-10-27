"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type CaptureKindKey =
  | "all"
  | "idea"
  | "task"
  | "question"
  | "reflection"
  | "note"
  | "reference"
  | "decision"
  | "other";

type FilterSpec = {
  key: CaptureKindKey;
  labelKey:
    | "filterAll"
    | "filterIdea"
    | "filterTask"
    | "filterQuestion"
    | "filterReflection"
    | "filterNote"
    | "filterReference"
    | "filterDecision"
    | "filterOther";
};

const FILTERS: FilterSpec[] = [
  { key: "all", labelKey: "filterAll" },
  { key: "idea", labelKey: "filterIdea" },
  { key: "task", labelKey: "filterTask" },
  { key: "question", labelKey: "filterQuestion" },
  { key: "reflection", labelKey: "filterReflection" },
  { key: "note", labelKey: "filterNote" },
  { key: "reference", labelKey: "filterReference" },
  { key: "decision", labelKey: "filterDecision" },
  { key: "other", labelKey: "filterOther" },
];

type Props = {
  value: CaptureKindKey;
  onChange: (v: CaptureKindKey) => void;
};

export function CaptureKindFilter({ value, onChange }: Props) {
  const t = useTranslations("memory.captureKindFilter");

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
