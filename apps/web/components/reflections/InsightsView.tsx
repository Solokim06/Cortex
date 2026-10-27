"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb, Sparkles, TrendingUp, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useReflectionsList,
  kindTone,
} from "@/lib/hooks/use-reflections";
import { useNow } from "@/lib/hooks/use-now";
import type { Reflection } from "@/lib/hooks/use-cortex";

type Props = {
  onOpenReflection: (id: string) => void;
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

export function InsightsView({ onOpenReflection }: Props) {
  const t = useTranslations("reflections.insights");
  const { data, isLoading } = useReflectionsList(undefined, 200);
  // Stable "now" from a custom hook — pure to read in render.
  const now = useNow();

  const { topLessons, decisionLinked, thisMonth, thisMonthCount } = useMemo(() => {
    const list: Reflection[] = data?.reflections ?? [];
    const lessons = list.filter((r) => r.kind === "lesson");
    const linked = list.filter((r) => !!r.decision_id);
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const month = list.filter(
      (r) => new Date(r.created_at).getTime() >= cutoff,
    );
    return {
      topLessons: lessons.slice(0, 6),
      decisionLinked: linked.slice(0, 6),
      thisMonth: month.slice(0, 8),
      thisMonthCount: month.length,
    };
  }, [data, now]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg bg-accent/20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!data?.reflections?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
        <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-sm font-medium">{t("noInsightsTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
          {t("noInsightsDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* This month digest */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <p className="text-sm font-medium">{t("thisMonthTitle")}</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{thisMonthCount}</span>{" "}
          {t("thisMonthSummary", { count: thisMonthCount })}
          {thisMonthCount > 0 && ` ${t("latestBelow")}`}
        </p>
        {thisMonth.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {thisMonth.slice(0, 4).map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenReflection(r.id)}
                className="w-full text-left flex items-start gap-2 rounded-md border border-transparent hover:border-border hover:bg-card/40 px-2 py-1.5 transition-colors"
              >
                <span
                  className={cn(
                    "text-[9px] rounded-full border px-1.5 py-0.5 shrink-0 mt-0.5",
                    kindTone(r.kind),
                  )}
                >
                  {r.kind === "lesson"
                    ? t("kindLesson")
                    : r.kind === "weekly_report"
                      ? t("kindReport")
                      : r.kind === "pattern_insight"
                        ? t("kindPattern")
                        : t("kindIdentity")}
                </span>
                <span className="text-xs truncate flex-1">
                  {r.title || r.content.slice(0, 80)}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {timeAgo(r.created_at, t)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top lessons */}
      {topLessons.length > 0 && (
        <Section
          icon={Lightbulb}
          title={t("topLessonsTitle")}
          subtitle={t("topLessonsSubtitle")}
        >
          <div className="space-y-2">
            {topLessons.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenReflection(r.id)}
                className="w-full text-left rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start gap-2.5">
                  <Lightbulb className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {r.title || t("untitledLesson")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {r.content}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {timeAgo(r.created_at, t)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Decision-linked reflections */}
      {decisionLinked.length > 0 && (
        <Section
          icon={GitBranch}
          title={t("fromDecisionsTitle")}
          subtitle={t("fromDecisionsSubtitle")}
        >
          <div className="space-y-2">
            {decisionLinked.map((r) => {
              const src =
                typeof r.meta?.source_question === "string"
                  ? r.meta.source_question
                  : null;
              return (
                <button
                  key={r.id}
                  onClick={() => onOpenReflection(r.id)}
                  className="w-full text-left rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start gap-2.5">
                    <GitBranch className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground italic truncate">
                        {src || t("pastDecisionFallback")}
                      </p>
                      <p className="text-sm mt-1 line-clamp-2 leading-relaxed">
                        {r.title || r.content.slice(0, 120)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {timeAgo(r.created_at, t)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
