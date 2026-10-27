"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Search,
  X,
  SlidersHorizontal,
  Loader2,
  ArrowUpDown,
  Archive,
} from "lucide-react";
import { cn } from "cn";
import type {
  TicketCategory,
  TicketFilters,
  TicketPriority,
  TicketStatus,
} from "@/lib/admin-api";
import { useAllTags } from "@/lib/hooks/use-all-tags";

// =====================================================================
// filter definitions
// =====================================================================

const STATUS_OPTIONS: {
  value: TicketStatus | "";
  labelKey: string;
  tone: string;
}[] = [
  { value: "", labelKey: "all_statuses", tone: "" },
  { value: "open", labelKey: "open", tone: "text-amber-500" },
  { value: "in_progress", labelKey: "in_progress", tone: "text-sky-500" },
  { value: "resolved", labelKey: "resolved", tone: "text-emerald-500" },
  { value: "closed", labelKey: "closed", tone: "" },
];

const PRIORITY_OPTIONS: {
  value: TicketPriority | "";
  labelKey: string;
  tone: string;
}[] = [
  { value: "", labelKey: "all_priorities", tone: "" },
  { value: "urgent", labelKey: "urgent", tone: "text-rose-500" },
  { value: "high", labelKey: "high", tone: "text-orange-500" },
  { value: "normal", labelKey: "normal", tone: "" },
  { value: "low", labelKey: "low", tone: "" },
];

const CATEGORY_OPTIONS: { value: TicketCategory | ""; labelKey: string }[] = [
  { value: "", labelKey: "all_categories" },
  { value: "bug", labelKey: "bug" },
  { value: "feature", labelKey: "feature" },
  { value: "question", labelKey: "question" },
  { value: "other", labelKey: "other" },
];

const SORT_OPTIONS: {
  value: NonNullable<TicketFilters["sort"]>;
  labelKey: string;
}[] = [
  { value: "updated_desc", labelKey: "sort_recent" },
  { value: "updated_asc", labelKey: "sort_oldest" },
  { value: "created_desc", labelKey: "sort_newest" },
  { value: "created_asc", labelKey: "sort_earliest" },
  { value: "priority_desc", labelKey: "sort_priority" },
];

// =====================================================================
// component
// =====================================================================

type Props = {
  filters: TicketFilters;
  onChange: (next: TicketFilters) => void;
  /** Debounced search value (parent controls the debounce) */
  search: string;
  onSearchChange: (next: string) => void;
  /** Loading indicator for the search input (from parent's query) */
  searchLoading?: boolean;
};

export function TicketFilters({
  filters,
  onChange,
  search,
  onSearchChange,
  searchLoading = false,
}: Props) {
  const tTickets = useTranslations("admin.tickets");
  const tStatus = useTranslations("admin.status");
  const tPriority = useTranslations("admin.priority");
  const tCategory = useTranslations("admin.category");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const tagsQuery = useAllTags();

  const update = (patch: Partial<TicketFilters>) => {
    // Reset pagination on any filter change
    onChange({ ...filters, ...patch, offset: 0 });
  };

  const clearAll = () => {
    onSearchChange("");
    onChange({ limit: filters.limit, offset: 0, show_hidden: undefined });
  };

  const activeFilterCount = [
    filters.status,
    filters.priority,
    filters.category,
    filters.assigned_to_user_id,
    filters.unassigned,
    filters.breached,
    filters.tag,
    search.trim().length > 0 ? "1" : "",
    // Cleared is not counted as a "filter" — it's a view toggle
  ].filter(Boolean).length;

  return (
    <div className="border-b border-border bg-card/20">
      {/* Primary row — search + dropdowns */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={tTickets("search_placeholder")}
            className={cn(
              "w-full pl-8 pr-8 py-1.5 text-sm rounded-md",
              "bg-background border border-border",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring",
            )}
          />
          {searchLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
          {!searchLoading && search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={tTickets("clear_search_aria")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status */}
        <FilterSelect
          value={filters.status ?? ""}
          onChange={(v) =>
            update({ status: (v || undefined) as TicketStatus | undefined })
          }
          translator={(k) =>
            k === "all_statuses"
              ? tTickets("all_statuses")
              : tStatus(k as Parameters<typeof tStatus>[0])
          }
          options={STATUS_OPTIONS}
        />

        {/* Priority */}
        <FilterSelect
          value={filters.priority ?? ""}
          onChange={(v) =>
            update({ priority: (v || undefined) as TicketPriority | undefined })
          }
          translator={(k) =>
            k === "all_priorities"
              ? tTickets("all_priorities")
              : tPriority(k as Parameters<typeof tPriority>[0])
          }
          options={PRIORITY_OPTIONS}
        />

        {/* Sort */}
        <div className="relative">
          <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <select
            value={filters.sort ?? "updated_desc"}
            onChange={(e) =>
              update({ sort: e.target.value as NonNullable<TicketFilters["sort"]> })
            }
            className={cn(
              "appearance-none pl-7 pr-7 py-1.5 text-xs rounded-md",
              "bg-background border border-border",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {tTickets(o.labelKey as Parameters<typeof tTickets>[0])}
              </option>
            ))}
          </select>
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors",
            showAdvanced || activeFilterCount > 2
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="w-3 h-3" />
          {tTickets("filters")}
          {activeFilterCount > 0 && (
            <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[9px] px-1.5 leading-tight">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Cleared toggle — shows tickets hidden from the admin list */}
        <button
          type="button"
          onClick={() => {
            const next = filters.show_hidden === true ? undefined : true;
            onChange({
              ...filters,
              show_hidden: next,
              offset: 0,
            });
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors",
            filters.show_hidden === true
              ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
          title={tTickets("cleared_toggle_title")}
        >
          <Archive className="w-3 h-3" />
          {tTickets("cleared")}
        </button>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {tTickets("clear_filters")}
          </button>
        )}
      </div>

      {/* Advanced row */}
      {showAdvanced && (
        <div className="flex items-center gap-2 px-4 pb-3 flex-wrap text-xs">
          {/* Category */}
          <FilterSelect
            value={filters.category ?? ""}
            onChange={(v) =>
              update({ category: (v || undefined) as TicketCategory | undefined })
            }
            translator={(k) => (k === "all_categories" ? tTickets("all_categories") : tCategory(k as Parameters<typeof tCategory>[0]))}
            options={CATEGORY_OPTIONS}
          />

          {/* Unassigned toggle */}
          <FilterChip
            active={!!filters.unassigned}
            onClick={() =>
              update({ unassigned: filters.unassigned ? undefined : true })
            }
            label={tTickets("unassigned_only")}
          />

          {/* Breached toggle */}
          <FilterChip
            active={!!filters.breached}
            onClick={() =>
              update({ breached: filters.breached ? undefined : true })
            }
            label={tTickets("sla_breached_chip")}
            tone="rose"
          />

          {/* Tags — toggle chips that filter by tag */}
          {tagsQuery.data && tagsQuery.data.length > 0 && (
            <div className="flex items-center gap-1.5 ml-2 flex-wrap">
              <span className="text-muted-foreground">Tags:</span>
              {tagsQuery.data.slice(0, 12).map(({ tag, count }) => {
                const active = filters.tag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      update({ tag: active ? undefined : tag })
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                      active
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border hover:border-primary/50 hover:bg-primary/5",
                    )}
                  >
                    {tag}
                    <span className="ml-1 text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// small building blocks
// =====================================================================

function FilterSelect({
  value,
  onChange,
  options,
  translator,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; labelKey: string; tone?: string }[];
  translator: (key: string) => string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "appearance-none px-2.5 py-1.5 text-xs rounded-md",
        "bg-background border border-border",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        current?.tone,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="text-foreground">
          {translator(o.labelKey)}
        </option>
      ))}
    </select>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tone = "primary",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "primary" | "rose";
}) {
  const activeTone =
    tone === "rose"
      ? "border-rose-500/50 bg-rose-500/10 text-rose-500"
      : "border-primary/50 bg-primary/10 text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        active
          ? activeTone
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
