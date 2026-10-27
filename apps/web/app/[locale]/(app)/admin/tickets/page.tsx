"use client";

import { useTranslations } from "next-intl";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { StatsHeader } from "@/components/admin/StatsHeader";
import { TicketFilters } from "@/components/admin/TicketFilters";
import { TicketRow } from "@/components/admin/TicketRow";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import { useAdminTickets } from "@/lib/hooks/use-admin-tickets";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import type { TicketFilters as TicketFiltersType } from "@/lib/admin-api";

const PAGE_SIZE = 50;

export default function AdminTicketsPage() {
  const t = useTranslations("admin.tickets");
  const [filters, setFilters] = useState<TicketFiltersType>({
    limit: PAGE_SIZE,
    offset: 0,
    sort: "updated_desc",
  });
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Merge the debounced search into the effective filters
  const effectiveFilters = useMemo<TicketFiltersType>(
    () => ({
      ...filters,
      search: debouncedSearch.trim() || undefined,
    }),
    [filters, debouncedSearch],
  );

  const ticketsQuery = useAdminTickets(effectiveFilters);
  const data = ticketsQuery.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? PAGE_SIZE;

  const handleToggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selected.size === items.length && items.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((t) => t.id)));
    }
  }, [items, selected.size]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + items.length, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <StatsHeader />

      <TicketFilters
        filters={filters}
        onChange={setFilters}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchLoading={ticketsQuery.isFetching && !!debouncedSearch.trim()}
      />

      {/* Bulk action bar (appears when items are selected) */}
      {selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          onDone={(result) => {
            clearSelection();
            if (result.updated > 0) {
              toast.success(
                `Updated ${result.updated} ticket${result.updated === 1 ? "" : "s"}` +
                  (result.skipped > 0 ? ` · ${result.skipped} skipped` : ""),
              );
            }
            if (result.errors.length > 0) {
              toast.error(`${result.errors.length} ticket(s) couldn't be updated`);
            }
          }}
          onCancel={clearSelection}
        />
      )}

      {/* Table header */}
      <div className="hidden md:grid grid-cols-[28px_minmax(0,1fr)_120px_140px_140px_120px] items-center gap-3 px-4 py-2 border-b border-border bg-card/30 text-[10px] uppercase tracking-wider text-muted-foreground">
        <input
          type="checkbox"
          checked={items.length > 0 && selected.size === items.length}
          ref={(el) => {
            if (el) {
              el.indeterminate =
                selected.size > 0 && selected.size < items.length;
            }
          }}
          onChange={handleSelectAll}
          className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
          aria-label="Select all tickets on this page"
        />
        <span>{t("columns_subject")}</span>
        <span>{t("columns_assignee")}</span>
        <span>{t("columns_sla")}</span>
        <span>{t("columns_updated")}</span>
        <span />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {ticketsQuery.isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!ticketsQuery.isLoading && items.length === 0 && (
          <EmptyState hasFilters={hasAnyFilter(effectiveFilters)} />
        )}

        {!ticketsQuery.isLoading &&
          items.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              selected={selected.has(ticket.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-card/30 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {pageStart}–{pageEnd} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  offset: Math.max(0, (f.offset ?? 0) - (f.limit ?? PAGE_SIZE)),
                }))
              }
              disabled={!canPrev || ticketsQuery.isFetching}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                "border border-border hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              <ChevronLeft className="w-3 h-3" />
              Prev
            </button>
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  offset: (f.offset ?? 0) + (f.limit ?? PAGE_SIZE),
                }))
              }
              disabled={!canNext || ticketsQuery.isFetching}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                "border border-border hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              Next
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================

function hasAnyFilter(f: TicketFiltersType): boolean {
  return !!(
    f.status ||
    f.priority ||
    f.category ||
    f.assigned_to_user_id ||
    f.unassigned ||
    f.breached ||
    f.tag ||
    (f.search && f.search.trim())
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
      <Inbox className="w-8 h-8 opacity-50" />
      <p className="text-sm">
        {hasFilters
          ? "No tickets match these filters."
          : "No tickets yet."}
      </p>
      {hasFilters && (
        <p className="text-xs opacity-70">
          Try widening the filters or clearing the search.
        </p>
      )}
    </div>
  );
}
