"use client";

import { useTranslations } from "next-intl";
import { GraduationCap, Search, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  kind: "no-goals" | "no-results" | "filter-empty";
  query?: string;
  filterLabel?: string;
  onCreate?: () => void;
  onExampleClick?: (title: string) => void;
};

export function EmptyState({
  kind,
  query,
  filterLabel,
  onCreate,
  onExampleClick,
}: Props) {
  const t = useTranslations("learning.empty");

  const examples = [t("example1"), t("example2"), t("example3")];

  if (kind === "no-goals") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
        <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-sm font-medium">{t("noGoalsTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
          {t("noGoalsDescription")}
        </p>
        {onCreate && (
          <Button onClick={onCreate} size="sm" className="mt-5">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t("createGoal")}
          </Button>
        )}
        {onExampleClick && (
          <div className="mt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {t("tryOne")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {examples.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onExampleClick(e)}
                  className="rounded-full border border-border bg-accent/20 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (kind === "filter-empty") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-10 text-center">
        <div className="inline-flex rounded-full bg-accent/40 p-3 mb-3">
          <GraduationCap className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium">
          {t("filterEmptyTitle", {
            filter: filterLabel?.toLowerCase() || t("matchingFallback"),
          })}
        </h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
          {t("filterEmptyDescription")}
        </p>
      </div>
    );
  }

  // no-results
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-10 text-center">
      <div className="inline-flex rounded-full bg-accent/40 p-3 mb-3">
        <Search className="w-5 h-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium">
        {t("noResultsTitle", { query: query ?? "" })}
      </h3>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
        {t("noResultsDescription")}
      </p>
    </div>
  );
}
