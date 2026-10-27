"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentActions } from "@/lib/hooks/use-agent-actions";
import { ProposalCard } from "./ProposalCard";

type Filter = "all" | "pending" | "applied" | "undone";

export function ActionsHistory() {
  const t = useTranslations("agent.history");
  const [filter, setFilter] = useState<Filter>("all");

  const status = filter === "all" ? undefined : filter;
  const { data, isLoading, isError, error } = useAgentActions(status);
  const actions = data?.actions ?? [];

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex items-center gap-1.5">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          {t("filterAll")}
        </FilterChip>
        <FilterChip
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
        >
          {t("filterPending")}
        </FilterChip>
        <FilterChip
          active={filter === "applied"}
          onClick={() => setFilter("applied")}
        >
          {t("filterApplied")}
        </FilterChip>
        <FilterChip
          active={filter === "undone"}
          onClick={() => setFilter("undone")}
        >
          {t("filterUndone")}
        </FilterChip>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-8">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("loading")}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-xs text-rose-500">
          {error instanceof Error ? error.message : t("loadFailed")}
        </div>
      )}

      {!isLoading && !isError && actions.length === 0 && (
        <div className="text-center py-12 text-xs text-muted-foreground italic">
          {t("empty")}
        </div>
      )}

      {!isLoading && !isError && actions.length > 0 && (
        <div className="space-y-3">
          {actions.map((a) => (
            <ProposalCard key={a.id} action={a} />
          ))}
        </div>
      )}
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
