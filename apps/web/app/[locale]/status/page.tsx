"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Activity,
} from "lucide-react";
import { cn } from "cn";
import { API_BASE } from "@/lib/cortex";

// =====================================================================
// types
// =====================================================================

type Level = "operational" | "degraded" | "down" | "unknown";

type Component = {
  key: string;
  label: string;
  status: Level;
  detail: string;
  latency_ms: number | null;
  provider: string | null;
};

type Snapshot = {
  overall: Level;
  generated_at: string;
  cached: boolean;
  components: Component[];
};

// =====================================================================
// config
// =====================================================================

const LEVEL_META: Record<
  Level,
  { icon: typeof CheckCircle2; tone: string; dot: string; label: string }
> = {
  operational: {
    icon: CheckCircle2,
    tone: "text-emerald-500",
    dot: "bg-emerald-500",
    label: "Operational",
  },
  degraded: {
    icon: AlertTriangle,
    tone: "text-amber-500",
    dot: "bg-amber-500",
    label: "Degraded",
  },
  down: {
    icon: XCircle,
    tone: "text-rose-500",
    dot: "bg-rose-500",
    label: "Down",
  },
  unknown: {
    icon: HelpCircle,
    tone: "text-muted-foreground",
    dot: "bg-muted-foreground/50",
    label: "Unknown",
  },
};

const REFRESH_INTERVAL_MS = 30_000;

// =====================================================================
// page
// =====================================================================

export default function StatusPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number>(0);
  const [tick, setTick] = useState(0);

  const fetchStatus = useCallback(async (force = false) => {
    try {
      const url = `${API_BASE}/public/status${force ? "?force=true" : ""}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as Snapshot;
      setSnapshot(data);
      setError(null);
      setLastFetched(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch — deferred via microtask so the effect body doesn't
  // call setState synchronously. React 19's lint rule flags direct calls.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) void fetchStatus();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [fetchStatus]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => {
      void fetchStatus();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Ticker for "checked Ns ago"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleManualRefresh = () => {
    setLoading(true);
    void fetchStatus(true);
  };

  if (loading && !snapshot) {
    return <CenteredLoader />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-8">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">
            Cortex
          </span>
        </div>

        {/* Header + overall */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight mb-2">
              System status
            </h1>
            {snapshot && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Last checked{" "}
                  <span className="tabular-nums">
                    {formatLastChecked(lastFetched, tick)}
                  </span>
                </span>
                <span className="opacity-40">·</span>
                <span>auto-refreshes every 30s</span>
                {snapshot.cached && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>cached</span>
                  </>
                )}
              </div>
            )}
          </div>

          {snapshot && <OverallBadge level={snapshot.overall} />}
        </div>

        {/* Error state */}
        {error && !snapshot && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-sm text-rose-500 mb-6">
            Couldn&apos;t load status: {error}
          </div>
        )}

        {/* Component list */}
        {snapshot && (
          <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
            <ul className="divide-y divide-border/60">
              {snapshot.components.map((c) => (
                <ComponentRow key={c.key} component={c} />
              ))}
            </ul>
          </div>
        )}

        {/* Manual refresh */}
        <div className="flex items-center justify-center mt-8">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
              "border border-border bg-background hover:bg-accent/40 transition-colors",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            <RefreshCw
              className={cn("w-3 h-3", loading && "animate-spin")}
            />
            Refresh now
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground mt-10">
          Cortex &mdash; the external mind
        </p>
      </div>
    </div>
  );
}

// =====================================================================
// pieces
// =====================================================================

function CenteredLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}

function OverallBadge({ level }: { level: Level }) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3 shrink-0">
      <div className={cn("rounded-full p-1.5 bg-muted/40")}>
        <Icon className={cn("w-4 h-4", meta.tone)} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          All systems
        </p>
        <p className={cn("text-sm font-medium", meta.tone)}>{meta.label}</p>
      </div>
    </div>
  );
}

function ComponentRow({ component }: { component: Component }) {
  const meta = LEVEL_META[component.status];
  const Icon = meta.icon;

  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-md bg-muted/40 flex items-center justify-center mt-0.5",
          meta.tone,
        )}
      >
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {component.label}
          </span>
          {component.provider && (
            <span className="text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground">
              {component.provider}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {meta.label}
          {component.detail && ` — ${component.detail}`}
        </p>
      </div>
      {component.latency_ms !== null && (
        <div className="shrink-0 text-right">
          <p className="text-xs font-medium tabular-nums">
            {component.latency_ms}
            <span className="text-[10px] text-muted-foreground ml-0.5">ms</span>
          </p>
        </div>
      )}
    </li>
  );
}

// =====================================================================
// helpers
// =====================================================================

function formatLastChecked(ts: number, tick: number): string {
  // `tick` is a render trigger; we don't actually use it, but including
  // it in the signature ensures React re-runs this on each tick.
  void tick;
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(ts).toLocaleTimeString();
}
