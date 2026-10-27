"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Check, Circle, ChevronRight, ChevronDown } from "lucide-react";
import type { LearningMilestone } from "@/lib/hooks/use-learning";

type Props = {
  milestone: LearningMilestone;
  done: boolean;
  onToggle: () => void;
  /** Optional: not shown when false */
  showActions?: boolean;
};

export function MilestoneRow({
  milestone,
  done,
  onToggle,
  showActions = true,
}: Props) {
  const t = useTranslations("learning.milestone");
  const [expanded, setExpanded] = useState(!done && showActions);
  const hasActions = (milestone.actions ?? []).length > 0;

  const handleRowClick = () => {
    if (hasActions) setExpanded((v) => !v);
  };

  return (
    <div className="group rounded-md border border-transparent hover:border-border hover:bg-accent/20 transition-colors">
      <div className="flex items-start gap-2.5 px-2 py-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            "shrink-0 mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
            done
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border hover:border-primary/60 text-transparent",
          )}
          aria-label={done ? t("markNotDoneAria") : t("markDoneAria")}
          aria-pressed={done}
        >
          {done ? (
            <Check className="w-3 h-3" strokeWidth={3} />
          ) : (
            <Circle className="w-2 h-2 opacity-0" />
          )}
        </button>

        <button
          type="button"
          onClick={handleRowClick}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-1.5">
            {hasActions ? (
              expanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <p
              className={cn(
                "text-sm leading-snug transition-colors",
                done && "line-through text-muted-foreground",
              )}
            >
              {milestone.title}
            </p>
          </div>

          {expanded && hasActions && (
            <ul className="mt-1.5 ml-4 space-y-1">
              {milestone.actions.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed"
                >
                  <span className="text-muted-foreground mt-0.5">·</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </button>
      </div>
    </div>
  );
}
