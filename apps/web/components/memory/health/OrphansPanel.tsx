"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { OrphanNode } from "@/lib/hooks/use-health";

function when(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function OrphansPanel({ items }: { items: OrphanNode[] }) {
  const t = useTranslations("memory.health.issues.orphans");

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-emerald-500">
          <AlertCircle className="w-3.5 h-3.5" />
          {t("empty")}
        </div>
      </div>
    );
  }

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

      <div className="space-y-1.5">
        {items.slice(0, 20).map((o) => (
          <Link
            key={o.id}
            href={`/memory?q=${encodeURIComponent(o.id)}`}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[11px] hover:bg-accent/40 transition-colors"
          >
            <span className="truncate flex-1 min-w-0">{o.title}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {when(o.created_at)}
            </span>
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
          </Link>
        ))}
        {items.length > 20 && (
          <div className="text-[10px] text-muted-foreground italic text-center pt-1">
            {t("more", { n: items.length - 20 })}
          </div>
        )}
      </div>
    </div>
  );
}
