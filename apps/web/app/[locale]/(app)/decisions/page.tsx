"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus, GitBranch, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecisionCard } from "@/components/decisions/DecisionCard";
import { DecisionDetail } from "@/components/decisions/DecisionDetail";
import { AnalyzeDialog } from "@/components/decisions/AnalyzeDialog";
import { PatternsView } from "@/components/decisions/PatternsView";
import { useDecisionsList, useDueReviews } from "@/lib/hooks/use-decisions";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import type { DecisionSummary } from "@/lib/hooks/use-cortex";

type Tab = "board" | "patterns";

type ColumnKey = "open" | "decided" | "reviewed" | "archived";

type ColumnSpec = {
  key: ColumnKey;
  labelKey: "colOpen" | "colDecided" | "colReviewed" | "colArchived";
  tone: string;
};

const COLUMNS: ColumnSpec[] = [
  {
    key: "open",
    labelKey: "colOpen",
    tone: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  },
  {
    key: "decided",
    labelKey: "colDecided",
    tone: "border-primary/40 text-primary",
  },
  {
    key: "reviewed",
    labelKey: "colReviewed",
    tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "archived",
    labelKey: "colArchived",
    tone: "border-border text-muted-foreground",
  },
];

function parseTab(v: string | null): Tab {
  return v === "patterns" ? "patterns" : "board";
}

export default function DecisionsPage() {
  return (
    <Suspense fallback={null}>
      <DecisionsInner />
    </Suspense>
  );
}

function DecisionsInner() {
  const t = useTranslations("decisions.page");
  const router = useRouter();
  const searchParams = useSearchParams();

  const decisionParam = searchParams.get("decision");
  const [tab, setTab] = useState<Tab>(parseTab(searchParams.get("tab")));
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [highlighted, setHighlighted] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error } = useDecisionsList(undefined, 200);
  const { data: dueData } = useDueReviews();

  const debounced = useDebouncedValue(query, 200);

  // URL sync — router from @/i18n/navigation auto-prefixes the locale.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (decisionParam) sp.set("decision", decisionParam);
    if (tab !== "board") sp.set("tab", tab);
    if (query.trim() && tab === "board") sp.set("q", query.trim());
    const qs = sp.toString();
    const target = qs ? `/decisions?${qs}` : "/decisions";
    router.replace(target, { scroll: false });
  }, [tab, decisionParam, query, router]);

  // "/" focuses search (Ctrl+K is global)
  useEffect(() => {
    if (decisionParam || tab !== "board") return;
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
  }, [decisionParam, tab]);

  const grouped = useMemo(() => {
    const list = data?.decisions ?? [];
    const q = debounced.trim().toLowerCase();
    const filtered = q
      ? list.filter((d) => d.question.toLowerCase().includes(q))
      : list;

    const g: Record<ColumnKey, DecisionSummary[]> = {
      open: [],
      decided: [],
      reviewed: [],
      archived: [],
    };
    for (const d of filtered) {
      const key = (
        ["open", "decided", "reviewed", "archived"].includes(d.status)
          ? d.status
          : "open"
      ) as ColumnKey;
      g[key].push(d);
    }
    return g;
  }, [data, debounced]);

  const flatOrdered = useMemo(() => {
    const out: DecisionSummary[] = [];
    for (const col of COLUMNS) out.push(...grouped[col.key]);
    return out;
  }, [grouped]);

  const totalCount = data?.decisions?.length ?? 0;
  const visibleCount =
    grouped.open.length +
    grouped.decided.length +
    grouped.reviewed.length +
    grouped.archived.length;
  const due = dueData?.decisions ?? [];

  const [prevKey, setPrevKey] = useState("");
  const key = `${debounced}|${tab}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (highlighted !== -1) setHighlighted(-1);
  }

  const openDecision = useCallback(
    (id: string) => {
      const sp = new URLSearchParams();
      sp.set("decision", id);
      if (tab !== "board") sp.set("tab", tab);
      router.push(`/decisions?${sp.toString()}`);
    },
    [tab, router],
  );

  const closeDecision = useCallback(() => {
    const sp = new URLSearchParams();
    if (tab !== "board") sp.set("tab", tab);
    const qs = sp.toString();
    router.push(qs ? `/decisions?${qs}` : "/decisions");
  }, [tab, router]);

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setHighlighted((i) => Math.min(i + 1, flatOrdered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setHighlighted((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && highlighted >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const d = flatOrdered[highlighted];
        if (d) openDecision(d.id);
      } else if (e.key === "Escape") {
        if (query) setQuery("");
        else inputRef.current?.blur();
      }
    },
    [flatOrdered, highlighted, openDecision, query],
  );

  if (decisionParam) {
    return (
      <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
        <div className="flex-1 overflow-y-auto">
          <DecisionDetail decisionId={decisionParam} onBack={closeDecision} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Button
          onClick={() => setAnalyzeOpen(true)}
          size="sm"
          className="shrink-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {t("newDecision")}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
        <TabButton active={tab === "board"} onClick={() => setTab("board")}>
          {t("tabBoard")}
        </TabButton>
        <TabButton
          active={tab === "patterns"}
          onClick={() => setTab("patterns")}
        >
          {t("tabPatterns")}
        </TabButton>
      </div>

      {/* Search bar — only on board tab */}
      {tab === "board" && totalCount > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 focus-within:border-primary/40 transition-colors max-w-2xl">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={t("searchPlaceholder")}
              className="flex-1 h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              spellCheck={false}
              autoComplete="off"
              aria-label={t("searchAria")}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label={t("clearAria")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-accent/30 px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
              /
            </kbd>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {t("visibleCount", {
                visible: visibleCount,
                total: totalCount,
              })}
            </span>
          </div>
        </div>
      )}

      {/* Due reviews rail */}
      {tab === "board" && due.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {t("dueForReview", { count: due.length })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {due.map((d) => (
              <button
                key={d.id}
                onClick={() => openDecision(d.id)}
                className="text-left rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs hover:border-primary/40 transition-colors max-w-xs"
              >
                <p className="truncate">{d.question}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-4 w-20 bg-accent/30 rounded animate-pulse" />
              <div className="h-24 bg-accent/20 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error instanceof Error ? error.message : t("loadFailed")}
        </div>
      )}

      {/* Empty — no decisions at all */}
      {!isLoading && !isError && totalCount === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-12 text-center">
          <div className="inline-flex rounded-full bg-primary/10 p-3 mb-4">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-sm font-medium">{t("emptyTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
            {t("emptyDescription")}
          </p>
          <Button
            onClick={() => setAnalyzeOpen(true)}
            size="sm"
            className="mt-5"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t("newDecision")}
          </Button>
        </div>
      )}

      {/* Board — has decisions but filter returned nothing */}
      {!isLoading &&
        !isError &&
        totalCount > 0 &&
        tab === "board" &&
        visibleCount === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card/20 px-6 py-10 text-center">
            <Search className="w-5 h-5 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-sm font-medium">
              {t("noMatchTitle", { query: debounced })}
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t("noMatchDescription")}
            </p>
          </div>
        )}

      {/* Board */}
      {!isLoading &&
        !isError &&
        totalCount > 0 &&
        tab === "board" &&
        visibleCount > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {COLUMNS.map((col) => {
                const items = grouped[col.key];
                return (
                  <div key={col.key} className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          col.tone,
                        )}
                      >
                        {t(col.labelKey)}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {items.length}
                      </span>
                    </div>

                    {items.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border bg-card/20 px-3 py-6 text-center">
                        <p className="text-[10px] text-muted-foreground">
                          {t("nothingHere")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((d) => {
                          const flatIdx = flatOrdered.findIndex(
                            (x) => x.id === d.id,
                          );
                          return (
                            <DecisionCard
                              key={d.id}
                              decision={d}
                              highlighted={flatIdx === highlighted}
                              onOpen={() => openDecision(d.id)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              <kbd className="px-1 py-0.5 rounded border border-border bg-accent/20">/</kbd>{" "}
              {t("shortcutHint")}
            </p>
          </>
        )}

      {/* Patterns */}
      {tab === "patterns" && <PatternsView />}

      <AnalyzeDialog
        open={analyzeOpen}
        onOpenChange={setAnalyzeOpen}
        onCreated={openDecision}
      />

      <span className="sr-only" aria-live="polite">
        {isLoading && <Loader2 className="w-0 h-0" />}
      </span>
    </div>
  );
}

function TabButton({
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
        "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
