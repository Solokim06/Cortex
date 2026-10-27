"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphHealth } from "@/lib/hooks/use-health";
import { OverviewTiles } from "@/components/memory/health/OverviewTiles";
import { TopologySection } from "@/components/memory/health/TopologySection";
import { ActivityTimeline } from "@/components/memory/health/ActivityTimeline";
import { OrphansPanel } from "@/components/memory/health/OrphansPanel";
import { PendingMergesPanel } from "@/components/memory/health/PendingMergesPanel";
import { StaleConceptsPanel } from "@/components/memory/health/StaleConceptsPanel";

export default function GraphHealthPage() {
  const t = useTranslations("memory.health");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useGraphHealth();

  const overview = data?.overview;
  const totalIssues = overview
    ? overview.orphan_concepts +
      overview.dangling_edges +
      overview.pending_merges +
      overview.stale_concepts
    : 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 md:px-6 pt-4 pb-4 border-b border-border/60">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
              <Link
                href="/memory"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                {t("backToMemory")}
              </Link>
              <span className="opacity-40">/</span>
              <span className="text-foreground">{t("pageTitle")}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t("pageTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pageSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs shrink-0",
                  "border border-border bg-background hover:bg-accent/50 transition-colors",
                  "disabled:opacity-40 disabled:pointer-events-none",
                )}
              >
                <RefreshCw
                  className={cn("w-3 h-3", isFetching && "animate-spin")}
                />
                {isFetching ? t("refreshing") : t("refresh")}
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-12">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("loading")}
              </div>
            )}

            {isError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-xs text-rose-500">
                {error instanceof Error ? error.message : t("loadFailed")}
              </div>
            )}

            {data && overview && (
              <>
                {/* Overview tiles */}
                <section className="space-y-3">
                  <SectionHeader
                    icon={<BarChart3 className="w-4 h-4 text-primary" />}
                    title={t("sections.overview")}
                  />
                  <OverviewTiles data={overview} />
                </section>

                {/* Topology + Activity --- two column */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <TopologySection data={data.topology} />
                  <ActivityTimeline data={data.activity} />
                </section>

                {/* Issues section --- only show if there are issues */}
                {totalIssues > 0 ? (
                  <section className="space-y-3">
                    <SectionHeader
                      icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                      title={t("sections.issues")}
                      badge={totalIssues}
                    />

                    {/* Pending merges first --- actionable */}
                    <PendingMergesPanel items={data.issues.pending_merges} />

                    {/* Stale concepts */}
                    <StaleConceptsPanel items={data.issues.stale} />

                    {/* Orphans */}
                    <OrphansPanel items={data.issues.orphans} />
                  </section>
                ) : (
                  <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-6 text-center">
                    <Sparkles className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                    <div className="text-sm font-medium text-emerald-500">
                      {t("allClean")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t("allCleanHint")}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-amber-500/15 text-amber-500 px-2 py-0.5 text-[10px] font-medium tabular-nums">
          {badge}
        </span>
      )}
    </div>
  );
}
