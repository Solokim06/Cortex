"use client";

import { useTranslations } from "next-intl";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeltaInfo } from "@/lib/hooks/use-cortex";

type Props = {
  delta: DeltaInfo | undefined;
  compact?: boolean;
};

export function DeltaBadge({ delta, compact = false }: Props) {
  const t = useTranslations("identity.delta");
  if (!delta) return null;

  const sizeClass = compact ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const iconClass = compact ? "w-2.5 h-2.5" : "w-3 h-3";
  const textClass = "text-[10px] font-medium";

  // Persistent = amber warning
  if (delta.persistent) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 text-warning",
          sizeClass,
          textClass,
        )}
        title={t("persistentTitle", {
          count: delta.appearances ?? 0,
        })}
      >
        <AlertTriangle className={iconClass} />
        <span>{t("persistentLabel")}</span>
      </span>
    );
  }

  // New = indigo sparkle
  if (delta.type === "new") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 text-primary",
          sizeClass,
          textClass,
        )}
        title={t("newTitle")}
      >
        <Sparkles className={iconClass} />
        <span>{t("newLabel")}</span>
      </span>
    );
  }

  // Stronger = green up arrow
  if (delta.type === "stronger") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 text-success",
          sizeClass,
          textClass,
        )}
        title={t("strongerTitle")}
      >
        <ArrowUp className={iconClass} />
        <span>{t("strongerLabel")}</span>
      </span>
    );
  }

  // Weaker = red down arrow
  if (delta.type === "weaker") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 text-destructive",
          sizeClass,
          textClass,
        )}
        title={t("weakerTitle")}
      >
        <ArrowDown className={iconClass} />
        <span>{t("weakerLabel")}</span>
      </span>
    );
  }

  // Stable = muted
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-accent/30 text-muted-foreground",
        sizeClass,
        textClass,
      )}
      title={t("stableTitle")}
    >
      <Minus className={iconClass} />
      <span>{t("stableLabel")}</span>
    </span>
  );
}
