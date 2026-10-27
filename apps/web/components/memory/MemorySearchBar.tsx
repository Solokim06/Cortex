"use client";

import { forwardRef, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemorySearchMode } from "@/lib/hooks/use-cortex";

type Props = {
  value: string;
  onChange: (v: string) => void;
  mode: MemorySearchMode;
  onModeChange: (m: MemorySearchMode) => void;
  loading?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export const MemorySearchBar = forwardRef<HTMLInputElement, Props>(
  function MemorySearchBar(
    { value, onChange, mode, onModeChange, loading = false, onKeyDown },
    ref,
  ) {
    const t = useTranslations("memory.searchBar");
    const [modeOpen, setModeOpen] = useState(false);
    const modeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!modeOpen) return;
      const onDocClick = (e: MouseEvent) => {
        if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
          setModeOpen(false);
        }
      };
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, [modeOpen]);

    return (
      <div className="relative flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 focus-within:border-primary/40 transition-colors">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          spellCheck={false}
          autoComplete="off"
          aria-label={t("searchAria")}
        />

        {loading && (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
        )}

        {value && !loading && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={t("clearAria")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="relative shrink-0" ref={modeRef}>
          <button
            type="button"
            onClick={() => setModeOpen((v) => !v)}
            className={cn(
              "rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors",
              modeOpen && "border-primary/40 text-foreground",
            )}
            aria-haspopup="menu"
            aria-expanded={modeOpen}
          >
            {mode === "hybrid" ? t("modeHybrid") : t("modeSemantic")}
          </button>
          {modeOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-40 rounded-md border border-border bg-popover shadow-lg z-20 py-1"
              role="menu"
            >
              {(["hybrid", "semantic"] as MemorySearchMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onModeChange(m);
                    setModeOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                    mode === m && "text-primary font-medium",
                  )}
                  role="menuitem"
                >
                  <p>
                    {m === "hybrid" ? t("modeHybrid") : t("modeSemantic")}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {m === "hybrid"
                      ? t("modeHybridHint")
                      : t("modeSemanticHint")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-accent/30 px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
          ⌘K
        </kbd>
      </div>
    );
  },
);
