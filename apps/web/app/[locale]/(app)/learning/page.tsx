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
import { Plus, Search, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoalCardWithProgress } from "@/components/learning/GoalCardWithProgress";
import { GoalDetail } from "@/components/learning/GoalDetail";
import { CreateGoalDialog } from "@/components/learning/CreateGoalDialog";
import { StatusFilter, type StatusKey } from "@/components/learning/StatusFilter";
import { EmptyState } from "@/components/learning/EmptyState";
import { useGoalsList, type LearningGoal } from "@/lib/hooks/use-learning";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

const VALID_FILTERS: StatusKey[] = [
  "all",
  "active",
  "completed",
  "paused",
  "archived",
];

function parseFilter(v: string | null): StatusKey {
  return v && VALID_FILTERS.includes(v as StatusKey)
    ? (v as StatusKey)
    : "all";
}

export default function LearningPage() {
  return (
    <Suspense fallback={null}>
      <LearningInner />
    </Suspense>
  );
}

function LearningInner() {
  const t = useTranslations("learning.page");
  const router = useRouter();
  const searchParams = useSearchParams();

  const goalParam = searchParams.get("goal");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filter, setFilter] = useState<StatusKey>(
    parseFilter(searchParams.get("filter")),
  );
  const [highlighted, setHighlighted] = useState<number>(-1);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingTitle, setPendingTitle] = useState<string | undefined>(
    undefined,
  );

  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error } = useGoalsList(100);
  const goals: LearningGoal[] = useMemo(() => data?.goals ?? [], [data]);

  const debounced = useDebouncedValue(query, 200);

  // ── URL sync ──
  useEffect(() => {
    const sp = new URLSearchParams();
    if (goalParam) sp.set("goal", goalParam);
    if (query.trim()) sp.set("q", query.trim());
    if (filter !== "all") sp.set("filter", filter);
    const qs = sp.toString();
    const target = qs ? `/learning?${qs}` : "/learning";
    router.replace(target, { scroll: false });
  }, [query, filter, goalParam, router]);

  // ── "/" focuses search (Ctrl+K is global) ──
  useEffect(() => {
    if (goalParam) return;
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
  }, [goalParam]);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return goals.filter((g) => {
      if (filter !== "all" && g.status !== filter) return false;
      if (!q) return true;
      return (
        g.title.toLowerCase().includes(q) ||
        (g.summary ?? "").toLowerCase().includes(q)
      );
    });
  }, [goals, filter, debounced]);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = {
      all: goals.length,
      active: 0,
      completed: 0,
      paused: 0,
      archived: 0,
    };
    for (const g of goals) {
      const s = (g.status || "active") as StatusKey;
      if (s in c) c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [goals]);

  const [prevKey, setPrevKey] = useState<string>("");
  const key = `${debounced}|${filter}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (highlighted !== -1) setHighlighted(-1);
  }

  const openGoal = useCallback(
    (goalId: string) => {
      const sp = new URLSearchParams();
      sp.set("goal", goalId);
      if (query.trim()) sp.set("q", query.trim());
      if (filter !== "all") sp.set("filter", filter);
      router.push(`/learning?${sp.toString()}`);
    },
    [query, filter, router],
  );

  const closeGoal = useCallback(() => {
    const sp = new URLSearchParams();
    if (query.trim()) sp.set("q", query.trim());
    if (filter !== "all") sp.set("filter", filter);
    const qs = sp.toString();
    router.push(qs ? `/learning?${qs}` : "/learning");
  }, [query, filter, router]);

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
        const g = filtered[highlighted];
        if (g) openGoal(g.id);
      } else if (e.key === "Escape") {
        if (query) setQuery("");
        else inputRef.current?.blur();
      }
    },
    [filtered, highlighted, openGoal, query],
  );

  const handleCreated = useCallback(
    (goalId: string) => {
      const sp = new URLSearchParams();
      sp.set("goal", goalId);
      router.push(`/learning?${sp.toString()}`);
    },
    [router],
  );

  if (goalParam) {
    return (
      <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
        <div className="flex-1 overflow-y-auto">
          <GoalDetail goalId={goalParam} onBack={closeGoal} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
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
          onClick={() => {
            setPendingTitle(undefined);
            setCreateOpen(true);
          }}
          size="sm"
          className="shrink-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {t("newGoal")}
        </Button>
      </div>

      {goals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 focus-within:border-primary/40 transition-colors">
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
            <StatusFilter value={filter} onChange={setFilter} counts={counts} />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {t("goalCount", { count: filtered.length })}
            </span>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg bg-accent/20 animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error instanceof Error ? error.message : t("loadFailed")}
        </div>
      )}

      {!isLoading && !isError && goals.length === 0 && (
        <EmptyState
          kind="no-goals"
          onCreate={() => setCreateOpen(true)}
          onExampleClick={(title) => {
            setPendingTitle(title);
            setCreateOpen(true);
          }}
        />
      )}

      {!isLoading && !isError && goals.length > 0 && filtered.length === 0 && (
        <>
          {debounced.trim() ? (
            <EmptyState kind="no-results" query={debounced} />
          ) : (
            <EmptyState kind="filter-empty" filterLabel={filter} />
          )}
        </>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((g, idx) => (
            <GoalCardWithProgress
              key={g.id}
              goal={g}
              highlighted={idx === highlighted}
              onOpen={() => openGoal(g.id)}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          <kbd className="px-1 py-0.5 rounded border border-border bg-accent/20">/</kbd>{" "}
          {t("shortcutHint")}
        </p>
      )}

      <CreateGoalDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
        initialTitle={pendingTitle}
      />

      <span className="sr-only" aria-live="polite">
        {isLoading && <Loader2 className="w-0 h-0" />}
      </span>
    </div>
  );
}
