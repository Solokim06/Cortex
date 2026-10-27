"use client";

import { createElement } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
} from "lucide-react";
import type { DecisionSummary } from "@/lib/hooks/use-cortex";
import { daysOverdue, daysUntil } from "@/lib/hooks/use-decisions";

type Props = {
  decision: DecisionSummary;
  highlighted?: boolean;
  onOpen: () => void;
};

type IconComponent = React.ComponentType<{ className?: string }>;

const STATUS_ICONS: Record<string, IconComponent> = {
  reviewed: CheckCircle2,
  decided: Clock,
  archived: Circle,
  open: AlertTriangle,
};

const DEFAULT_STATUS_ICON: IconComponent = AlertTriangle;

function StatusIcon({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status] ?? DEFAULT_STATUS_ICON;
  return createElement(Icon, { className });
}

export function DecisionCard({
  decision,
  highlighted = false,
  onOpen,
}: Props) {
  const t = useTranslations("decisions.card");
  const overdue =
    decision.status === "decided" && decision.review_at
      ? daysOverdue(decision.review_at)
      : 0;
  const upcoming =
    decision.status === "decided" && decision.review_at
      ? daysUntil(decision.review_at)
      : 0;
  const isOverdue = overdue > 0;

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
        "group w-full text-left rounded-lg border bg-card/40 p-3 transition-colors cursor-pointer outline-none",
        highlighted
          ? "border-primary/60 bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-card/60",
      )}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <StatusIcon
          status={decision.status}
          className={cn(
            "w-3.5 h-3.5 mt-0.5 shrink-0",
            decision.status === "reviewed"
              ? "text-emerald-500"
              : isOverdue
                ? "text-amber-500"
                : "text-muted-foreground",
          )}
        />
        <p className="text-sm font-medium leading-snug line-clamp-2 min-w-0">
          {decision.question}
        </p>
      </div>

      {decision.chosen_option && (
        <p className="text-[11px] text-muted-foreground ml-5 mb-1 line-clamp-1">
          → {decision.chosen_option}
        </p>
      )}

      {decision.lesson && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 ml-5 mb-1 line-clamp-2 italic">
          &ldquo;{decision.lesson}&rdquo;
        </p>
      )}

      {decision.status === "decided" && decision.review_at && (
        <p
          className={cn(
            "text-[10px] ml-5",
            isOverdue
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          {isOverdue
            ? t("reviewOverdue", { count: overdue })
            : t("reviewIn", { count: upcoming })}
        </p>
      )}
    </div>
  );
}
