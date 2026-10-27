"use client";

import { useTranslations } from "next-intl";
import { Loader2, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { useDecisionPatterns } from "@/lib/hooks/use-decisions";
import { cn } from "@/lib/utils";

export function PatternsView() {
  const t = useTranslations("decisions.patterns");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDecisionPatterns();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-accent/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
        {error instanceof Error ? error.message : t("loadFailed")}
      </div>
    );
  }

  const patterns = data?.patterns ?? [];
  const strengths = data?.strengths ?? [];
  const blindSpots = data?.blind_spots ?? [];
  const hasAny =
    patterns.length > 0 || strengths.length > 0 || blindSpots.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
        <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-sm font-medium">{t("notEnoughTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
          {data?.note ?? t("notEnoughDescription")}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 text-xs text-primary hover:underline"
        >
          {t("checkAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t("basedOnCount", { count: data?.count ?? 0 })}
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 disabled:opacity-50"
        >
          {isFetching ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          {t("rerunAnalysis")}
        </button>
      </div>

      {patterns.length > 0 && (
        <div className="space-y-3">
          {patterns.map((p, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card/40 p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-medium">{p.name}</p>
                <span
                  className={cn(
                    "text-[10px] rounded-full border px-2 py-0.5 shrink-0",
                    p.confidence === "high"
                      ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                      : p.confidence === "medium"
                        ? "border-sky-500/40 text-sky-600 dark:text-sky-400"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {p.confidence}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {p.description}
              </p>
              {p.evidence.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {p.evidence.map((e, j) => (
                    <li
                      key={j}
                      className="text-[11px] text-foreground/70 flex items-start gap-1.5 leading-relaxed"
                    >
                      <span className="text-muted-foreground shrink-0 mt-0.5">
                        ·
                      </span>
                      <span className="italic">&ldquo;{e}&rdquo;</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {strengths.length > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium">{t("strengthsTitle")}</p>
          </div>
          <ul className="space-y-1.5">
            {strengths.map((s, i) => (
              <li
                key={i}
                className="text-xs leading-relaxed flex items-start gap-1.5"
              >
                <span className="text-emerald-500 shrink-0 mt-0.5">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blindSpots.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium">{t("blindSpotsTitle")}</p>
          </div>
          <ul className="space-y-1.5">
            {blindSpots.map((s, i) => (
              <li
                key={i}
                className="text-xs leading-relaxed flex items-start gap-1.5"
              >
                <span className="text-amber-500 shrink-0 mt-0.5">!</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
