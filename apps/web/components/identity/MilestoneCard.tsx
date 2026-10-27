"use client";

import { useTranslations } from "next-intl";
import {
  Sparkles,
  Compass,
  TrendingUp,
  Anchor,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/lib/hooks/use-cortex";

type Props = {
  milestone: Milestone;
  isLatest?: boolean;
};

type CategoryKey = "origin" | "discovery" | "growth" | "stabilizing" | "consolidation";

type CategoryMeta = {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  labelKey: CategoryKey;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  origin: {
    icon: Sparkles,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/40",
    labelKey: "origin",
  },
  discovery: {
    icon: Compass,
    color: "text-info",
    bg: "bg-info/10",
    border: "border-info/40",
    labelKey: "discovery",
  },
  growth: {
    icon: TrendingUp,
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/40",
    labelKey: "growth",
  },
  stabilizing: {
    icon: Anchor,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/40",
    labelKey: "stabilizing",
  },
  consolidation: {
    icon: Layers,
    color: "text-muted-foreground",
    bg: "bg-accent/30",
    border: "border-border",
    labelKey: "consolidation",
  },
};

type TimeTranslator = (
  key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo",
  values?: Record<string, string | number>,
) => string;

function timeAgo(iso: string, t: TimeTranslator): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("justNow");
  if (diff < 3600) return t("minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("daysAgo", { count: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MilestoneCard({ milestone, isLatest = false }: Props) {
  const t = useTranslations("identity.milestone");
  const meta =
    CATEGORY_META[milestone.category] || CATEGORY_META.consolidation;
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/40 p-4 transition-colors",
        isLatest ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div
          className={cn(
            "rounded-md p-2 shrink-0 mt-0.5 border",
            meta.bg,
            meta.border,
          )}
        >
          <Icon className={cn("w-4 h-4", meta.color)} />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Title + meta */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold tracking-tight leading-snug">
              {milestone.title}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {isLatest && (
                <span className="text-[10px] font-medium rounded-md border border-primary/40 bg-primary/10 text-primary px-1.5 py-0.5">
                  {t("latestBadge")}
                </span>
              )}
              <span
                className={cn(
                  "text-[10px] font-medium rounded-md border px-1.5 py-0.5",
                  meta.bg,
                  meta.border,
                  meta.color,
                )}
              >
                {t(meta.labelKey)}
              </span>
            </div>
          </div>

          {/* Highlights */}
          {milestone.highlights && (
            <p className="text-xs text-foreground/80 leading-snug">
              {milestone.highlights}
            </p>
          )}

          {/* Timestamp row */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-0.5">
            <span>{timeAgo(milestone.created_at, t)}</span>
            <span className="text-muted-foreground">·</span>
            <span>{formatDate(milestone.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
