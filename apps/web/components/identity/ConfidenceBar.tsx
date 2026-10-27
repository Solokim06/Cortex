"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = {
  appearances: number;
  /** Maximum expected appearances to consider "full". Default 10 (last 10 snapshots). */
  max?: number;
  className?: string;
};

type LabelTranslator = (
  key: "confidenceStrong" | "confidenceEstablished" | "confidenceEmerging" | "confidenceNew",
) => string;

function confidenceLabel(
  appearances: number,
  t: LabelTranslator,
): {
  label: string;
  color: string;
  width: number;
} {
  if (appearances >= 8) {
    return {
      label: t("confidenceStrong"),
      color: "bg-success",
      width: 90,
    };
  }
  if (appearances >= 5) {
    return {
      label: t("confidenceEstablished"),
      color: "bg-primary",
      width: 65,
    };
  }
  if (appearances >= 3) {
    return {
      label: t("confidenceEmerging"),
      color: "bg-info",
      width: 45,
    };
  }
  return {
    label: t("confidenceNew"),
    color: "bg-muted-foreground/60",
    width: 25,
  };
}

export function ConfidenceBar({ appearances, max = 10, className }: Props) {
  const t = useTranslations("identity.confidence");
  const { label, color, width } = confidenceLabel(appearances, t);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1 rounded-full bg-accent/40 overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500 rounded-full",
            color,
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-24 text-right shrink-0">
        {t("labelWithCount", { label, count: appearances, max })}
      </span>
    </div>
  );
}
