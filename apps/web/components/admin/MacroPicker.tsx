"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Search,
  X,
  Wand2,
  Eye,
  ArrowLeft,
} from "lucide-react";
import { cn } from "cn";
import {
  fetchMacros,
  previewMacro,
  suggestMacros,
  type Macro,
} from "@/lib/admin-api";

type Props = {
  ticketId: string;
  onSelect: (renderedBody: string) => void;
  onClose: () => void;
};

/**
 * Popover for picking a canned response.
 *
 * Shows two sections:
 *   - "Suggested" — macros whose tags match the ticket's category /
 *     priority / applied tags (from /admin/tickets/{id}/macros/suggest)
 *   - "All macros" — every macro (from /admin/macros)
 *
 * Clicking a macro loads a preview of the rendered body (variables like
 * {{filer_name}} substituted for this specific ticket). From the preview
 * the admin can "Use" (inject into the textarea) or go back.
 */
export function MacroPicker({ ticketId, onSelect, onClose }: Props) {
  const t = useTranslations("admin.tickets.macros");
  const { getToken } = useAuth();

  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<Macro | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // All macros
  const macrosQuery = useQuery({
    queryKey: ["admin-macros"],
    staleTime: 60_000,
    queryFn: () => fetchMacros(getToken),
  });

  // Suggested for this ticket
  const suggestedQuery = useQuery({
    queryKey: ["admin-ticket-macros-suggest", ticketId],
    staleTime: 60_000,
    queryFn: () => suggestMacros(getToken, ticketId),
  });

  // Preview mutation (called when a macro is clicked)
  const previewMutation = useMutation({
    mutationFn: (macro: Macro) => previewMacro(getToken, ticketId, macro.id),
    onSuccess: (data) => setPreviewText(data.rendered),
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewing) {
          setPreviewing(null);
          setPreviewText(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, previewing]);

  // Autofocus search on mount
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);

  // Filter by search query
  const allMacros = useMemo(
    () => macrosQuery.data ?? [],
    [macrosQuery.data],
  );
  const suggested = useMemo(
    () => suggestedQuery.data ?? [],
    [suggestedQuery.data],
  );

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allMacros;
    return allMacros.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [allMacros, query]);

  const suggestedIds = useMemo(
    () => new Set(suggested.map((m) => m.id)),
    [suggested],
  );

  // ----------------------------------------------------------------
  // Preview mode
  // ----------------------------------------------------------------
  if (previewing) {
    return (
      <div
        ref={containerRef}
        className="mb-2 rounded-lg border border-primary/40 bg-popover shadow-lg overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-primary/5">
          <button
            type="button"
            onClick={() => {
              setPreviewing(null);
              setPreviewText(null);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("aria_back")}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <Eye className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium truncate">
            {previewing.title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label={t("aria_close")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-3 py-2.5 max-h-72 overflow-y-auto">
          {previewMutation.isPending || previewText === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t("rendering_preview")}
            </div>
          ) : (
            <pre className="text-xs whitespace-pre-wrap break-words font-sans text-foreground/90">
              {previewText}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border bg-card/30">
          <button
            type="button"
            onClick={() => {
              setPreviewing(null);
              setPreviewText(null);
            }}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={previewText === null}
            onClick={() => {
              if (previewText !== null) onSelect(previewText);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            <Wand2 className="w-3 h-3" />
            {t("use_this")}
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // List mode
  // ----------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="mb-2 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
    >
      {/* Search bar */}
      <div className="relative border-b border-border/60">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full pl-8 pr-8 py-2 text-xs bg-transparent focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={t("aria_close")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto">
        {/* Loading state */}
        {macrosQuery.isLoading && (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
          </div>
        )}

        {/* No macros at all */}
        {!macrosQuery.isLoading && allMacros.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            <p className="italic">{t("empty_title")}</p>
            <p className="text-[10px] mt-1 opacity-70">
              {t("empty_hint")}
            </p>
          </div>
        )}

        {/* Suggested */}
        {!query && suggested.length > 0 && (
          <Section title={t("section_suggested")} icon={Sparkles}>
            {suggested.map((m) => (
              <MacroRow
                key={m.id}
                macro={m}
                onClick={() => {
                  setPreviewing(m);
                  setPreviewText(null);
                  previewMutation.mutate(m);
                }}
              />
            ))}
          </Section>
        )}

        {/* All macros */}
        {!macrosQuery.isLoading && filteredAll.length > 0 && (
          <Section
            title={
              query
                ? t("section_results", { n: filteredAll.length })
                : t("section_all")
            }
          >
            {filteredAll
              .filter((m) => !suggestedIds.has(m.id) || !!query)
              .map((m) => (
                <MacroRow
                  key={m.id}
                  macro={m}
                  onClick={() => {
                    setPreviewing(m);
                    setPreviewText(null);
                    previewMutation.mutate(m);
                  }}
                />
              ))}
          </Section>
        )}

        {/* No search results */}
        {!macrosQuery.isLoading && query && filteredAll.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            {t("no_results", { query })}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// subcomponents
// =====================================================================

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-card/30 border-b border-border/40">
        {Icon && <Icon className="w-2.5 h-2.5 text-primary" />}
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function MacroRow({
  macro,
  onClick,
}: {
  macro: Macro;
  onClick: () => void;
}) {
  const preview = macro.body.split("\n")[0].slice(0, 90);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 border-b border-border/30 last:border-b-0",
        "hover:bg-accent/40 transition-colors",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium truncate">{macro.title}</span>
        {macro.tags.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {macro.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="text-[9px] rounded bg-muted/60 px-1 py-0.5 text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
        {preview}
        {macro.body.length > 90 && "…"}
      </p>
    </button>
  );
}
