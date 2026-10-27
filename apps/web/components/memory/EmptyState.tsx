"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  kind: "no-query" | "no-results" | "weak-matches" | "no-data";
  query?: string;
  onExampleClick?: (q: string) => void;
  onReindex?: () => void;
  onSwitchToHybrid?: () => void;
};

export function EmptyState({
  kind,
  query,
  onExampleClick,
  onReindex,
  onSwitchToHybrid,
}: Props) {
  const t = useTranslations("memory.empty");

  const examples = [
    t("example1"),
    t("example2"),
    t("example3"),
  ];

  if (kind === "no-data") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
        <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-sm font-medium">{t("noDataTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
          {t("noDataDescription")}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/capture">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("captureSomething")}
            </Link>
          </Button>
          {onReindex && (
            <Button variant="ghost" size="sm" onClick={onReindex}>
              {t("reindexExisting")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (kind === "weak-matches") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-10 text-center">
        <div className="inline-flex rounded-full bg-accent/40 p-3 mb-3">
          <Search className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium">
          {t("weakMatchesTitle", { query: query ?? "" })}
        </h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
          {t("weakMatchesDescription")}
        </p>
        {onSwitchToHybrid && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSwitchToHybrid}
            className="mt-5"
          >
            {t("switchToHybrid")}
          </Button>
        )}
      </div>
    );
  }

  if (kind === "no-results") {
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
        {onReindex && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReindex}
            className="mt-5"
          >
            {t("reindexMyGraph")}
          </Button>
        )}
      </div>
    );
  }

  // no-query
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
      <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
        <Search className="w-5 h-5 text-primary" />
      </div>
      <h3 className="text-sm font-medium">{t("noQueryTitle")}</h3>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
        {t("noQueryDescription")}
      </p>
      {onExampleClick && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {examples.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onExampleClick(q)}
              className="rounded-full border border-border bg-accent/20 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
