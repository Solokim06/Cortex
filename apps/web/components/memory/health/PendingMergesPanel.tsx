"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAliasAction, type PendingMerge } from "@/lib/hooks/use-health";

function similarityPct(s: number) {
  return `${Math.round(s * 100)}%`;
}

export function PendingMergesPanel({ items }: { items: PendingMerge[] }) {
  const t = useTranslations("memory.health.issues.merges");
  const action = useAliasAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-emerald-500">
          <Sparkles className="w-3.5 h-3.5" />
          {t("empty")}
        </div>
      </div>
    );
  }

  const handle = async (aliasRowId: string, kind: "accept" | "reject") => {
    setBusyId(aliasRowId);
    try {
      await action.mutateAsync({ aliasRowId, action: kind });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-semibold tracking-tight text-amber-500">
          {t("title")}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {t("count", { n: items.length })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3">
        {t("hint")}
      </p>

      <div className="space-y-2">
        {items.slice(0, 10).map((m) => {
          const busy = busyId === m.alias_row_id;
          return (
            <div
              key={m.alias_row_id}
              className="rounded-md border border-border bg-background/60 px-3 py-2.5"
            >
              <div className="flex items-baseline gap-2 text-[11px] mb-1">
                <span className="font-medium text-foreground truncate max-w-[40%]">
                  {m.alias_title}
                </span>
                <span className="text-muted-foreground shrink-0">{"->"}</span>
                <span className="font-medium text-foreground truncate max-w-[40%]">
                  {m.canonical_title}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {similarityPct(m.similarity)}
                </span>
              </div>

              {m.note && (
                <div className="text-[10px] text-muted-foreground mb-2 truncate">
                  {m.note}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handle(m.alias_row_id, "accept")}
                  disabled={busy}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-1 text-[10px]",
                    "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25",
                    "disabled:opacity-40 disabled:pointer-events-none transition-colors",
                  )}
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  {t("accept")}
                </button>
                <button
                  type="button"
                  onClick={() => handle(m.alias_row_id, "reject")}
                  disabled={busy}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-1 text-[10px]",
                    "bg-rose-500/15 text-rose-500 hover:bg-rose-500/25",
                    "disabled:opacity-40 disabled:pointer-events-none transition-colors",
                  )}
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                  {t("reject")}
                </button>
              </div>
            </div>
          );
        })}
        {items.length > 10 && (
          <div className="text-[10px] text-muted-foreground italic text-center pt-1">
            {t("more", { n: items.length - 10 })}
          </div>
        )}
      </div>
    </div>
  );
}
