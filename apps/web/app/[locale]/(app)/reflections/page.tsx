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
import { Search, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReflectionCard } from "@/components/reflections/ReflectionCard";
import { ReflectionDetail } from "@/components/reflections/ReflectionDetail";
import { KindFilter, type KindKey } from "@/components/reflections/KindFilter";
import { EmptyState } from "@/components/reflections/EmptyState";
import { WeeklyReportView } from "@/components/reflections/WeeklyReportView";
import { InsightsView } from "@/components/reflections/InsightsView";
import { GenerateReportDialog } from "@/components/reflections/GenerateReportDialog";
import { useReflectionsList } from "@/lib/hooks/use-reflections";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import type { Reflection } from "@/lib/hooks/use-cortex";

type Tab = "feed" | "report" | "insights";

const VALID_TABS: Tab[] = ["feed", "report", "insights"];

function parseTab(v: string | null): Tab {
  return v && VALID_TABS.includes(v as Tab) ? (v as Tab) : "feed";
}

const KIND_KEYS: KindKey[] = [
  "all",
  "lesson",
  "weekly_report",
  "pattern_insight",
  "identity_update",
];

function parseKind(v: string | null): KindKey {
  return v && KIND_KEYS.includes(v as KindKey) ? (v as KindKey) : "all";
}

export default function ReflectionsPage() {
  return (
    <Suspense fallback={null}>
      <ReflectionsInner />
    </Suspense>
  );
}

function ReflectionsInner() {
  const t = useTranslations("reflections.page");
  const router = useRouter();
  const searchParams = useSearchParams();

  const reflectionParam = searchParams.get("reflection");
  const [tab, setTab] = useState<Tab>(parseTab(searchParams.get("tab")));
  const [kind, setKind] = useState<KindKey>(
    parseKind(searchParams.get("kind")),
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [highlighted, setHighlighted] = useState<number>(-1);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error } = useReflectionsList(undefined, 200);
  const allReflections: Reflection[] = useMemo(() => data?.reflections ?? [], [data]);

  const debounced = useDebouncedValue(query, 200);

  // URL sync
  useEffect(() => {
    const sp = new URLSearchParams();
    if (reflectionParam) sp.set("reflection", reflectionParam);
    if (tab !== "feed") sp.set("tab", tab);
    if (kind !== "all" && tab === "feed") sp.set("kind", kind);
    if (query.trim() && tab === "feed") sp.set("q", query.trim());
    const qs = sp.toString();
    const target = qs ? `/reflections?${qs}` : "/reflections";
    router.replace(target, { scroll: false });
  }, [tab, kind, query, reflectionParam, router]);

  // `/` focuses the page's search — deliberately NOT ⌘K, which is
  // owned by the global CommandPalette.
  useEffect(() => {
    if (reflectionParam || tab !== "feed") return;
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
  }, [reflectionParam, tab]);

  const counts = useMemo(() => {
    const c: Record<KindKey, number> = {
      all: allReflections.length,
      lesson: 0,
      weekly_report: 0,
      pattern_insight: 0,
      identity_update: 0,
    };
    for (const r of allReflections) {
      const k = (r.kind || "lesson") as KindKey;
      if (k in c) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [allReflections]);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return allReflections.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return (
        (r.title ?? "").toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q)
      );
    });
  }, [allReflections, kind, debounced]);

  const [prevKey, setPrevKey] = useState("");
  const key = `${debounced}|${kind}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (highlighted !== -1) setHighlighted(-1);
  }

  const openReflection = useCallback(
    (id: string) => {
      const sp = new URLSearchParams();
      sp.set("reflection", id);
      if (tab !== "feed") sp.set("tab", tab);
      router.push(`/reflections?${sp.toString()}`);
    },
    [tab, router],
  );

  const closeReflection = useCallback(() => {
    const sp = new URLSearchParams();
    if (tab !== "feed") sp.set("tab", tab);
    const qs = sp.toString();
    router.push(qs ? `/reflections?${qs}` : "/reflections");
  }, [tab, router]);

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
        const r = filtered[highlighted];
        if (r) openReflection(r.id);
      } else if (e.key === "Escape") {
        if (query) setQuery("");
        else inputRef.current?.blur();
      }
    },
    [filtered, highlighted, openReflection, query],
  );

  if (reflectionParam) {
    return (
      <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
        <div className="flex-1 overflow-y-auto">
          <ReflectionDetail
            reflectionId={reflectionParam}
            onBack={closeReflection}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
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
          onClick={() => setGeneratorOpen(true)}
          size="sm"
          className="shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          {t("generateReport")}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
        <TabButton active={tab === "feed"} onClick={() => setTab("feed")}>
          {t("tabFeed")}
        </TabButton>
        <TabButton active={tab === "report"} onClick={() => setTab("report")}>
          {t("tabReport")}
        </TabButton>
        <TabButton
          active={tab === "insights"}
          onClick={() => setTab("insights")}
        >
          {t("tabInsights")}
        </TabButton>
      </div>

      {/* Feed tab */}
      {tab === "feed" && (
        <div className="space-y-4">
          {allReflections.length > 0 && (
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
          )}

          {allReflections.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <KindFilter value={kind} onChange={setKind} counts={counts} />
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {t("reflectionCount", { count: filtered.length })}
              </span>
            </div>
          )}

          {isLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-lg bg-accent/20 animate-pulse"
                />
              ))}
            </div>
          )}

          {!isLoading && isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
              {error instanceof Error
                ? error.message
                : t("loadFailed")}
            </div>
          )}

          {!isLoading && !isError && allReflections.length === 0 && (
            <EmptyState
              kind="no-reflections"
              onGenerate={() => setGeneratorOpen(true)}
            />
          )}

          {!isLoading &&
            !isError &&
            allReflections.length > 0 &&
            filtered.length === 0 && (
              <>
                {debounced.trim() ? (
                  <EmptyState kind="no-results" query={debounced} />
                ) : (
                  <EmptyState kind="filter-empty" filterLabel={kind} />
                )}
              </>
            )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((r, idx) => (
                <ReflectionCard
                  key={r.id}
                  reflection={r}
                  highlighted={idx === highlighted}
                  onOpen={() => openReflection(r.id)}
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
        </div>
      )}

      {tab === "report" && (
        <WeeklyReportView onOpenReflection={openReflection} />
      )}

      {tab === "insights" && (
        <InsightsView onOpenReflection={openReflection} />
      )}

      <GenerateReportDialog
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        onCreated={(r) => openReflection(r.id)}
      />

      <span className="sr-only" aria-live="polite">
        {isLoading && t("srLoading")}
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
