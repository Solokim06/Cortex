"use client";

import {
  useCallback,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Activity, Sparkles, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { MemorySearchBar } from "@/components/memory/MemorySearchBar";
import { ResultCard } from "@/components/memory/ResultCard";
import { ResultSkeleton } from "@/components/memory/ResultSkeleton";
import { EmptyState } from "@/components/memory/EmptyState";
import { TypeFilter, type TypeKey } from "@/components/memory/TypeFilter";
import {
  CaptureKindFilter,
  type CaptureKindKey,
} from "@/components/memory/CaptureKindFilter";
import { ReindexButton } from "@/components/memory/ReindexButton";
import { useTopicsList } from "@/lib/hooks/use-topics";
import { useGraphHealth } from "@/lib/hooks/use-health";
import { useAgentActionsSummary } from "@/lib/hooks/use-agent-actions";
import {
  SourcePreviewProvider,
  useSourcePreview,
} from "@/components/chat/SourcePreviewContext";
import { SourcePanel } from "@/components/chat/SourcePanel";
import {
  useMemorySearch,
  useRecentNodes,
  type MemorySearchMode,
} from "@/lib/hooks/use-cortex";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

const TOP_SCORE_GATE = 0.72;

const VALID_MODES: MemorySearchMode[] = ["hybrid", "semantic"];

function parseMode(v: string | null): MemorySearchMode {
  return v && VALID_MODES.includes(v as MemorySearchMode)
    ? (v as MemorySearchMode)
    : "hybrid";
}

const TYPE_KEYS: TypeKey[] = [
  "all",
  "thought",
  "concept",
  "decision",
  "reflection",
];

function parseType(v: string | null): TypeKey {
  return v && TYPE_KEYS.includes(v as TypeKey) ? (v as TypeKey) : "all";
}

const CAPTURE_KIND_KEYS: CaptureKindKey[] = [
  "all",
  "idea",
  "task",
  "question",
  "reflection",
  "note",
  "reference",
  "decision",
  "other",
];

function parseCaptureKind(v: string | null): CaptureKindKey {
  return v && CAPTURE_KIND_KEYS.includes(v as CaptureKindKey)
    ? (v as CaptureKindKey)
    : "all";
}

function kindOf(node: { meta?: Record<string, unknown> | null }): CaptureKindKey {
  const c = (node.meta?.capture_classification ?? null) as
    | { kind?: string }
    | null;
  const k = c?.kind;
  if (k && (CAPTURE_KIND_KEYS as string[]).includes(k)) {
    return k as CaptureKindKey;
  }
  return "other";
}

export default function MemoryPage() {
  return (
    <Suspense fallback={null}>
      <SourcePreviewProvider>
        <MemoryInner />
      </SourcePreviewProvider>
    </Suspense>
  );
}

function MemoryInner() {
  const t = useTranslations("memory.page");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [mode, setMode] = useState<MemorySearchMode>(
    parseMode(searchParams.get("mode")),
  );
  const [typeFilter, setTypeFilter] = useState<TypeKey>(
    parseType(searchParams.get("type")),
  );
  const [captureKind, setCaptureKind] = useState<CaptureKindKey>(
    parseCaptureKind(searchParams.get("kind")),
  );
  const [highlighted, setHighlighted] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const { openedNodeId, openSource, closeSource } = useSourcePreview();

  const debounced = useDebouncedValue(query, 350);
  const { data, isFetching, isError, error } = useMemorySearch(
    debounced || null,
    mode,
    25,
  );

  const { data: recent } = useRecentNodes(1);

  // ?"??"? Sync state to URL ?"??"?
  useEffect(() => {
    const sp = new URLSearchParams();
    if (query.trim()) sp.set("q", query.trim());
    if (mode !== "hybrid") sp.set("mode", mode);
    if (typeFilter !== "all") sp.set("type", typeFilter);
    if (captureKind !== "all") sp.set("kind", captureKind);
    const qs = sp.toString();
    const target = qs ? `/memory?${qs}` : "/memory";
    router.replace(target, { scroll: false });
  }, [query, mode, typeFilter, captureKind, router]);

  // ?"??"? "/" focuses the page search (Ctrl+K is global) ?"??"?
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          (target.tagName === "INPUT" && target !== inputRef.current))
      ) {
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rawResults = useMemo(() => data?.results ?? [], [data]);
  const totalResults = rawResults.length;

  const filtered = useMemo(() => {
    let out = rawResults;
    if (typeFilter !== "all") {
      out = out.filter((r) => r.type === typeFilter);
    }
    if (captureKind !== "all") {
      out = out.filter((r) => kindOf(r) === captureKind);
    }
    return out;
  }, [rawResults, typeFilter, captureKind]);

  const topScore = rawResults[0]?.score ?? 0;
  const hasStrongTopHit = topScore >= TOP_SCORE_GATE;

  const [prevKey, setPrevKey] = useState<string>("");
  const key = `${debounced}|${mode}|${typeFilter}|${captureKind}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (highlighted !== -1) setHighlighted(-1);
  }

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setHighlighted((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && highlighted >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const hit = filtered[highlighted];
        if (hit) openSource(hit.id);
      } else if (e.key === "Escape") {
        if (query) setQuery("");
        else inputRef.current?.blur();
      }
    },
    [filtered, highlighted, openSource, query],
  );

  const hasAnyNodes = (recent?.count ?? 0) > 0 || totalResults > 0;
  const showSkeleton = isFetching && totalResults === 0;
  const hasQuery = debounced.trim().length > 0;

  const hasKeywordHits = rawResults.some((r) => r.score === 0);
  const isWeakSemanticOnly =
    mode === "semantic" && totalResults > 0 && !hasStrongTopHit;
  const isWeakHybridOnly =
    mode === "hybrid" &&
    totalResults > 0 &&
    !hasStrongTopHit &&
    !hasKeywordHits;

  const showWeakMatches = isWeakSemanticOnly || isWeakHybridOnly;
  const showNoResults =
    hasQuery && !isFetching && !isError && totalResults === 0;

  const filteredFromSuffix =
    typeFilter !== "all" && totalResults !== filtered.length
      ? t("filteredFromSuffix", { count: totalResults })
      : "";

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 md:px-6 pt-4 pb-4 border-b border-border/60">
          <div className="flex items-start justify-between gap-3 max-w-4xl mx-auto">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>
            <ReindexButton />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-4">
            <MemorySearchBar
              ref={inputRef}
              value={query}
              onChange={setQuery}
              mode={mode}
              onModeChange={setMode}
              loading={isFetching}
              onKeyDown={onSearchKeyDown}
            />

            <TopicsLinkCard />
            <HealthLinkCard />
            <AgentActionsCard />

            {hasQuery && (
              <p className="text-[10px] text-muted-foreground -mt-2 px-1">
                {mode === "hybrid"
                  ? t("rankedHybrid")
                  : t("rankedSemantic")}
              </p>
            )}

            {hasQuery &&
              !showWeakMatches &&
              !showNoResults &&
              filtered.length > 0 && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <TypeFilter value={typeFilter} onChange={setTypeFilter} />
                  <CaptureKindFilter
                    value={captureKind}
                    onChange={setCaptureKind}
                  />
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {t("resultCount", { count: filtered.length })}
                    {filteredFromSuffix}
                  </span>
                </div>
              )}

            {!hasQuery && hasAnyNodes && (
              <EmptyState
                kind="no-query"
                onExampleClick={(q) => setQuery(q)}
              />
            )}

            {!hasQuery && !hasAnyNodes && <EmptyState kind="no-data" />}

            {hasQuery && showSkeleton && (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <ResultSkeleton key={i} />
                ))}
              </div>
            )}

            {hasQuery && !showSkeleton && isError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
                {error instanceof Error
                  ? error.message
                  : t("searchFailed")}
              </div>
            )}

            {hasQuery && !showSkeleton && !isError && showWeakMatches && (
              <EmptyState
                kind="weak-matches"
                query={debounced}
                onSwitchToHybrid={
                  mode === "semantic" ? () => setMode("hybrid") : undefined
                }
              />
            )}

            {hasQuery && !showSkeleton && !isError && showNoResults && (
              <EmptyState kind="no-results" query={debounced} />
            )}

            {hasQuery &&
              !showSkeleton &&
              !isError &&
              !showWeakMatches &&
              !showNoResults &&
              filtered.length > 0 && (
                <div className="space-y-2">
                  {filtered.map((hit, idx) => (
                    <ResultCard
                      key={hit.id}
                      hit={hit}
                      showScore={mode === "semantic" || hit.score > 0}
                      highlighted={idx === highlighted}
                      onOpen={() => openSource(hit.id)}
                    />
                  ))}
                </div>
              )}

            {hasQuery &&
              !showWeakMatches &&
              !showNoResults &&
              filtered.length > 0 && (
                <p className="text-[10px] text-muted-foreground text-center pt-2">
                  <kbd className="px-1 py-0.5 rounded border border-border bg-accent/20">/</kbd>{" "}
                  {t("shortcutHint")}
                </p>
              )}
          </div>
        </div>
      </div>

      <SourcePanel nodeId={openedNodeId} onClose={closeSource} />
    </div>
  );
}


function TopicsLinkCard() {
  const t = useTranslations("memory.topics");
  const { data } = useTopicsList(200);
  const count = data?.concepts.length ?? 0;
  const readyCount = data?.concepts.filter((c) => c.has_synthesis).length ?? 0;

  if (count === 0) return null;

  return (
    <Link
      href="/memory/topics"
      className="group flex items-center gap-3 rounded-lg border border-border bg-card/40 px-3.5 py-2.5 hover:border-primary/40 hover:bg-card/60 transition-colors"
    >
      <div className="shrink-0 rounded-md p-2 bg-primary/10">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("linkCardTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("linkCardSubtitle", { total: count, ready: readyCount })}
        </p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground shrink-0 transition-colors" />
    </Link>
  );
}


function HealthLinkCard() {
  const t = useTranslations("memory.health");
  const { data } = useGraphHealth();
  const overview = data?.overview;

  // Don't show the card if there's nothing in the graph yet.
  if (!overview || overview.nodes_total === 0) return null;

  const actionable =
    overview.pending_merges + overview.stale_concepts + overview.orphan_concepts;
  const needsReview = actionable > 0;

  return (
    <Link
      href="/memory/health"
      className="group flex items-center gap-3 rounded-lg border border-border bg-card/40 px-3.5 py-2.5 hover:border-primary/40 hover:bg-card/60 transition-colors"
    >
      <div
        className={
          "shrink-0 rounded-md p-2 " +
          (needsReview ? "bg-amber-500/15" : "bg-primary/10")
        }
      >
        <Activity
          className={
            "w-3.5 h-3.5 " +
            (needsReview ? "text-amber-500" : "text-primary")
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("pageTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {needsReview
            ? `${actionable} item${actionable === 1 ? "" : "s"} need review`
            : "Graph is healthy"}
        </p>
      </div>
      {needsReview && (
        <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-500 px-2 py-0.5 text-[10px] font-medium tabular-nums">
          {actionable}
        </span>
      )}
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground shrink-0 transition-colors" />
    </Link>
  );
}

function AgentActionsCard() {
  const t = useTranslations("agent.memoryCard");
  const summary = useAgentActionsSummary();

  // Nothing to show if the graph has no actions
  if (summary.pending === 0 && summary.failed === 0 && summary.recent === 0) {
    return null;
  }

  const needsAttention = summary.pending + summary.failed > 0;

  return (
    <Link
      href="/memory/actions"
      className="group flex items-center gap-3 rounded-lg border border-border bg-card/40 px-3.5 py-2.5 hover:border-primary/40 hover:bg-card/60 transition-colors"
    >
      <div
        className={
          "shrink-0 rounded-md p-2 " +
          (needsAttention ? "bg-amber-500/15" : "bg-primary/10")
        }
      >
        <Sparkles
          className={
            "w-3.5 h-3.5 " +
            (needsAttention ? "text-amber-500" : "text-primary")
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-xs text-muted-foreground">
          {needsAttention
            ? t("needsReview", {
                pending: summary.pending,
                failed: summary.failed,
              })
            : t("recentOnly", { recent: summary.recent })}
        </p>
      </div>
      {needsAttention && (
        <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-500 px-2 py-0.5 text-[10px] font-medium tabular-nums">
          {summary.pending + summary.failed}
        </span>
      )}
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground shrink-0 transition-colors" />
    </Link>
  );
}
