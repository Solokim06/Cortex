"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lightbulb, Search, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  kind: "no-reflections" | "no-results" | "filter-empty";
  query?: string;
  filterLabel?: string;
  onGenerate?: () => void;
  onExampleClick?: (q: string) => void;
};

export function EmptyState({
  kind,
  query,
  filterLabel,
  onGenerate,
}: Props) {
  const t = useTranslations("reflections.empty");

  if (kind === "no-reflections") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
        <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
          <Lightbulb className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-sm font-medium">{t("noReflectionsTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
          {t("noReflectionsDescription")}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/decisions">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("goToDecisions")}
            </Link>
          </Button>
          {onGenerate && (
            <Button variant="ghost" size="sm" onClick={onGenerate}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {t("generateReport")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (kind === "filter-empty") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-10 text-center">
        <div className="inline-flex rounded-full bg-accent/40 p-3 mb-3">
          <Lightbulb className="w-5 h-5 text-muted-foreground" />
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
