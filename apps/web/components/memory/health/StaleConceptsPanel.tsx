"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BellOff, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useDismissStale, type StaleNode } from "@/lib/hooks/use-health";

export function StaleConceptsPanel({ items }: { items: StaleNode[] }) {
  const t = useTranslations("memory.health.issues.stale");
  const dismiss = useDismissStale();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-emerald-500">
          <Clock className="w-3.5 h-3.5" />
          {t("empty")}
        </div>
      </div>
    );
  }

  const handle = async (nodeId: string) => {
    setBusyId(nodeId);
    try {
      await dismiss.mutateAsync({ nodeId, days: 90 });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-semibold tracking-tight">
          {t("title")}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {t("count", { n: items.length })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3">
        {t("hint")}
      </p>

      <div className="space-y-1.5">
        {items.slice(0, 20).map((s) => {
          const busy = busyId === s.id;
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[11px]"
            >
              <Link
                href={`/memory?q=${encodeURIComponent(s.id)}`}
                className="flex-1 min-w-0 truncate hover:underline"
              >
                {s.title}
              </Link>
              {s.age_days !== null && (
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {t("ageDays", { n: s.age_days })}
                </span>
              )}
              <button
                type="button"
                onClick={() => handle(s.id)}
                disabled={busy}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                  "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  "disabled:opacity-40 disabled:pointer-events-none transition-colors",
                )}
                title={t("dismissTitle")}
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <BellOff className="w-3 h-3" />
                )}
                {t("dismiss")}
              </button>
            </div>
          );
        })}
        {items.length > 20 && (
          <div className="text-[10px] text-muted-foreground italic text-center pt-1">
            {t("more", { n: items.length - 20 })}
          </div>
        )}
      </div>
    </div>
  );
}
