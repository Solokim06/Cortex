"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { HealthOverview } from "@/lib/hooks/use-health";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "ok";
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-500"
      : tone === "ok"
        ? "text-emerald-500"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", valueClass)}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {hint}
        </div>
      )}
    </div>
  );
}

export function OverviewTiles({ data }: { data: HealthOverview }) {
  const t = useTranslations("memory.health.overview");

  // Build the node-type hint string: "12 thought, 8 concept, 2 decision"
  const typeHint =
    Object.entries(data.nodes_by_type)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ") || "empty";

  const edgeHint =
    Object.entries(data.edges_by_type)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ") || "empty";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      <Tile
        label={t("nodes")}
        value={data.nodes_total}
        hint={typeHint}
      />
      <Tile
        label={t("edges")}
        value={data.edges_total}
        hint={edgeHint}
      />
      <Tile
        label={t("canonical")}
        value={data.canonical_concepts}
        hint={t("aliasedHint", { n: data.aliased_concepts })}
      />
      <Tile
        label={t("medianDegree")}
        value={data.median_degree}
        hint={t("edgesPerNode")}
      />
      <Tile
        label={t("embeddingCoverage")}
        value={pct(data.embedding_coverage)}
        hint={`${data.embedded_nodes} / ${data.nodes_total}`}
        tone={data.embedding_coverage >= 0.9 ? "ok" : "warn"}
      />
      <Tile
        label={t("orphanConcepts")}
        value={data.orphan_concepts}
        hint={data.orphan_concepts > 0 ? t("needsAttention") : t("allConnected")}
        tone={data.orphan_concepts > 0 ? "warn" : "ok"}
      />
      <Tile
        label={t("staleConcepts")}
        value={data.stale_concepts}
        hint={data.stale_concepts > 0 ? t("reviewHint") : t("noneStale")}
        tone={data.stale_concepts > 0 ? "warn" : "ok"}
      />
      <Tile
        label={t("pendingMerges")}
        value={data.pending_merges}
        hint={data.pending_merges > 0 ? t("needsReview") : t("nonePending")}
        tone={data.pending_merges > 0 ? "warn" : "ok"}
      />
    </div>
  );
}
