"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useReflectionsList,
  kindTone,
} from "@/lib/hooks/use-reflections";
import { GenerateReportDialog } from "./GenerateReportDialog";
import type { Reflection } from "@/lib/hooks/use-cortex";

type Props = {
  onOpenReflection: (id: string) => void;
};

export function WeeklyReportView({ onOpenReflection }: Props) {
  const t = useTranslations("reflections.weeklyReport");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const { data, isLoading } = useReflectionsList("weekly_report", 20);

  const reports: Reflection[] = data?.reflections ?? [];
  const latest = reports[0];

  return (
    <div className="space-y-5">
      {/* Generate banner */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0 mt-0.5">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("bannerTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {t("bannerDescription")}
            </p>
          </div>
          <Button
            onClick={() => setGeneratorOpen(true)}
            size="sm"
            className="shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {t("generate")}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg bg-accent/20 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state — no reports yet */}
      {!isLoading && reports.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
          <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-sm font-medium">{t("emptyTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
            {t("emptyDescription")}
          </p>
          <Button
            onClick={() => setGeneratorOpen(true)}
            size="sm"
            className="mt-5"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {t("generateReport")}
          </Button>
        </div>
      )}

      {/* Latest report — expanded card */}
      {!isLoading && latest && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("latestLabel")}
          </p>
          <button
            onClick={() => onOpenReflection(latest.id)}
            className="group w-full text-left rounded-lg border border-primary/30 bg-primary/5 p-5 transition-colors hover:border-primary/60"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    kindTone(latest.kind),
                  )}
                >
                  <BarChart3 className="w-2.5 h-2.5" />
                  {typeof latest.meta?.days === "number"
                    ? t("lastNDays", { count: latest.meta.days })
                    : t("reportFallback")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(latest.created_at).toLocaleDateString()}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>

            <p className="text-sm font-medium mb-2 line-clamp-1">
              {latest.title}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {latest.content}
            </p>

            {Array.isArray(latest.meta?.themes) &&
              (latest.meta.themes as string[]).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  {(latest.meta.themes as string[]).slice(0, 4).map((tag, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-border bg-card/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
          </button>
        </div>
      )}

      {/* Older reports */}
      {!isLoading && reports.length > 1 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("earlierLabel")}
          </p>
          <div className="space-y-2">
            {reports.slice(1).map((r) => {
              const decisionCount =
                typeof r.meta?.decision_count === "number"
                  ? r.meta.decision_count
                  : null;
              return (
                <button
                  key={r.id}
                  onClick={() => onOpenReflection(r.id)}
                  className="w-full text-left rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/40 flex items-start gap-3"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {r.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(r.created_at).toLocaleDateString()}
                      {decisionCount !== null
                        ? ` · ${t("decisionCount", { count: decisionCount })}`
                        : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <GenerateReportDialog
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        onCreated={(r) => onOpenReflection(r.id)}
      />
    </div>
  );
}
