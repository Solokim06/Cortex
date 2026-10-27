"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  ArrowUpRight,
  CheckCircle2,
  PauseCircle,
  Circle,
} from "lucide-react";
import type { LearningGoal } from "@/lib/hooks/use-learning";

type Props = {
  goal: LearningGoal;
  /** 0–100, optional. If omitted, the progress row is hidden. */
  progressPct?: number;
  /** Done / total milestones */
  doneCount?: number;
  totalCount?: number;
  highlighted?: boolean;
  onOpen: () => void;
};

type PillTranslator = (
  key: "statusCompleted" | "statusPaused" | "statusArchived" | "statusActive",
) => string;

function statusPill(
  status: string,
  t: PillTranslator,
): {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
} {
  if (status === "completed")
    return {
      label: t("statusCompleted"),
      Icon: CheckCircle2,
      tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    };
  if (status === "paused")
    return {
      label: t("statusPaused"),
      Icon: PauseCircle,
      tone: "border-amber-500/40 text-amber-600 dark:text-amber-400",
    };
  if (status === "archived")
    return {
      label: t("statusArchived"),
      Icon: Circle,
      tone: "border-border text-muted-foreground",
    };
  return {
    label: t("statusActive"),
    Icon: GraduationCap,
    tone: "border-primary/40 text-primary",
  };
}

export function GoalCard({
  goal,
  progressPct,
  doneCount,
  totalCount,
  highlighted = false,
  onOpen,
}: Props) {
  const t = useTranslations("learning.card");
  const { label, Icon, tone } = statusPill(goal.status, t);
  const showProgress =
    typeof progressPct === "number" &&
    typeof doneCount === "number" &&
    typeof totalCount === "number" &&
    totalCount > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group w-full text-left rounded-lg border bg-card/40 p-4 transition-colors cursor-pointer outline-none",
        highlighted
          ? "border-primary/60 bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-card/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-1.5 shrink-0 mt-0.5">
          <GraduationCap className="w-3.5 h-3.5 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                tone,
              )}
            >
              <Icon className="w-2.5 h-2.5" />
              {label}
            </span>
            {showProgress && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {t("milestoneProgress", { done: doneCount, total: totalCount })}
              </span>
            )}
          </div>

          <p className="text-sm font-medium leading-snug truncate">
            {goal.title}
          </p>

          {goal.summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {goal.summary}
            </p>
          )}

          {showProgress && (
            <div className="mt-2.5">
              <div className="h-1 rounded-full bg-accent/40 overflow-hidden">
                <div
                  className="h-full bg-primary/70 transition-[width] duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end mt-2">
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              {t("open")}
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
