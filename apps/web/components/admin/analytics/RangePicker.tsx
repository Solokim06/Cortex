"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { Calendar, RotateCcw } from "lucide-react";
import { cn } from "cn";
import type { DateRange } from "@/lib/hooks/use-admin-analytics";

// =====================================================================
// presets
// =====================================================================

type Preset = {
  key: string;
  labelKey: string;
  get: () => DateRange;
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

const PRESETS: Preset[] = [
  { key: "today", labelKey: "range_today", get: () => ({ from: isoToday(), to: isoToday() }) },
  { key: "7d", labelKey: "range_7d", get: () => ({ days: 7 }) },
  { key: "30d", labelKey: "range_30d", get: () => ({ days: 30 }) },
  { key: "90d", labelKey: "range_90d", get: () => ({ days: 90 }) },
];

function detectActivePreset(range: DateRange): string | null {
  if (range.from && range.to) {
    if (range.from === isoToday() && range.to === isoToday()) return "today";
    return null;
  }
  if (range.days === 7) return "7d";
  if (range.days === 30) return "30d";
  if (range.days === 90) return "90d";
  if (range.days === 1) return "today";
  return null;
}

// =====================================================================
// component
// =====================================================================

type Props = {
  value: DateRange;
  onChange: (next: DateRange) => void;
};

export function RangePicker({ value, onChange }: Props) {
  const t = useTranslations("admin.analytics");
  const active = detectActivePreset(value);

  // Draft state for the date inputs. Parent still owns the applied range.
  // On blur (or Enter), if both dates are valid we push up.
  const [draftFrom, setDraftFrom] = useState(value.from ?? "");
  const [draftTo, setDraftTo] = useState(value.to ?? "");

  // Preset clicks reset the drafts so the inputs match the new range.
  // We do this manually in the click handler — no effect.
  const applyPreset = (preset: Preset) => {
    const next = preset.get();
    onChange(next);
    setDraftFrom(next.from ?? "");
    setDraftTo(next.to ?? "");
  };

  const applyCustom = () => {
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(draftFrom) &&
      /^\d{4}-\d{2}-\d{2}$/.test(draftTo);
    if (!valid) return;
    onChange({ from: draftFrom, to: draftTo });
  };

  const reset = () => {
    const next: DateRange = { days: 30 };
    onChange(next);
    setDraftFrom("");
    setDraftTo("");
  };

  const isCustomActive = active === null && (value.from || value.to);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset pills */}
      <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/30 border border-border/60">
        {PRESETS.map((p) => {
          const selected = active === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(p.labelKey as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border/60 mx-1" aria-hidden />

      {/* Custom date inputs */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 transition-colors",
          isCustomActive ? "border-primary/60" : "border-border",
        )}
      >
        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
        <input
          type="date"
          value={draftFrom}
          onChange={(e) => setDraftFrom(e.target.value)}
          onBlur={applyCustom}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyCustom();
          }}
          className={cn(
            "bg-transparent text-[11px] tabular-nums outline-none w-27.5",
            "text-foreground placeholder:text-muted-foreground",
            "scheme-dark",
          )}
          aria-label="Start date"
        />
        <span className="text-muted-foreground text-[10px]">→</span>
        <input
          type="date"
          value={draftTo}
          onChange={(e) => setDraftTo(e.target.value)}
          onBlur={applyCustom}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyCustom();
          }}
          className={cn(
            "bg-transparent text-[11px] tabular-nums outline-none w-27.5",
            "text-foreground placeholder:text-muted-foreground",
            "scheme-dark",
          )}
          aria-label="End date"
        />
      </div>

      {/* Reset — shows when custom is active */}
      {isCustomActive && (
        <button
          type="button"
          onClick={reset}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]",
            "text-muted-foreground hover:text-foreground",
            "border border-border bg-background hover:bg-accent/40 transition-colors",
          )}
          title={t("range_reset_title")}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      )}
    </div>
  );
}
