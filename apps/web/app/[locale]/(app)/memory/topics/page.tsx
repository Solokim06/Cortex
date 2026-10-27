"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicCard } from "@/components/memory/TopicCard";
import { useTopicsList } from "@/lib/hooks/use-topics";

type Filter = "all" | "ready" | "empty";

export default function TopicsPage() {
  const t = useTranslations("memory.topics");
  const { data, isLoading, isError, error } = useTopicsList();
  const [filter, setFilter] = useState<Filter>("all");

  const concepts = useMemo(() => data?.concepts ?? [], [data]);

  const filtered = useMemo(() => {
    if (filter === "all") return concepts;
    if (filter === "ready") return concepts.filter((c) => c.has_synthesis);
    return concepts.filter((c) => !c.has_synthesis);
  }, [concepts, filter]);

  const readyCount = concepts.filter((c) => c.has_synthesis).length;

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 md:px-6 pt-4 pb-4 border-b border-border/60">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
              <Link href="/memory" className="hover:text-foreground transition-colors">
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
              {concepts.length > 0 && (
                <div className="text-[11px] text-muted-foreground whitespace-nowrap pt-1">
                  {t("readyCount", { ready: readyCount, total: concepts.length })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-4">
            {/* Filter chips */}
            {concepts.length > 0 && (
              <div className="flex items-center gap-1.5">
                <FilterChip
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  {t("filterAll")}
                </FilterChip>
                <FilterChip
                  active={filter === "ready"}
                  onClick={() => setFilter("ready")}
                >
                  {t("filterReady")}
                </FilterChip>
                <FilterChip
                  active={filter === "empty"}
                  onClick={() => setFilter("empty")}
                >
                  {t("filterEmpty")}
                </FilterChip>
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-8">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("loading")}
              </div>
            )}

            {/* Error */}
            {isError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-xs text-rose-500">
                {error instanceof Error ? error.message : t("loadFailed")}
              </div>
            )}

            {/* Empty — no concepts at all */}
            {!isLoading && !isError && concepts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <BookOpen className="w-8 h-8 opacity-40" />
                <p className="text-sm">{t("noConceptsTitle")}</p>
                <p className="text-xs text-muted-foreground text-center max-w-md">
                  {t("noConceptsHint")}
                </p>
                <Link
                  href="/capture"
                  className="text-xs text-primary hover:underline mt-1"
                >
                  {t("goCapture")}
                </Link>
              </div>
            )}

            {/* Empty — filter has no matches */}
            {!isLoading &&
              !isError &&
              concepts.length > 0 &&
              filtered.length === 0 && (
                <div className="text-center py-12 text-xs text-muted-foreground italic">
                  {t("filterNoMatches")}
                </div>
              )}

            {/* The list */}
            {!isLoading && !isError && filtered.length > 0 && (
              <div className="space-y-2">
                {filtered.map((topic) => (
                  <TopicCard key={topic.id} topic={topic} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/40",
      )}
    >
      {children}
    </button>
  );
}
