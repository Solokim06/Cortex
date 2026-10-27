"use client";

import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import type { HealthActivity } from "@/lib/hooks/use-health";

function when(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "pending"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
      : status === "rejected"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

export function ActivityTimeline({ data }: { data: HealthActivity }) {
  const t = useTranslations("memory.health.activity");

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="text-xs font-semibold tracking-tight mb-3">
        {t("title")}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("merges")}
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {data.recent_merges_7d}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("captures")}
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {data.recent_captures_7d}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("edges")}
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {data.recent_edges_7d}
          </div>
        </div>
      </div>

      {data.recent_merges_list.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-4 text-center">
          {t("empty")}
        </div>
      ) : (
        <>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {t("recentMerges")}
          </div>
          <div className="space-y-2">
            {data.recent_merges_list.map((m, i) => (
              <div
                key={`${m.alias_title}-${i}`}
                className="flex items-start gap-2 text-[11px]"
              >
                <Clock className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    <span className="text-foreground">{m.alias_title}</span>
                    <span className="text-muted-foreground">{" -> "}</span>
                    <span className="text-foreground">
                      {m.canonical_title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <StatusPill status={m.status} />
                    <span>{m.strategy}</span>
                    <span>??</span>
                    <span>{Math.round(m.similarity * 100)}%</span>
                    {m.when && (
                      <>
                        <span>??</span>
                        <span>{when(m.when)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
