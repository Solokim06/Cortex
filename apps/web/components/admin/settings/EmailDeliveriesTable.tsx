"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Ban,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  useEmailDeliveries,
  type EmailDelivery,
} from "@/lib/hooks/use-admin-emails";
import { timeAgo } from "@/components/admin/TicketBadges";

const STATUS_VALUES = ["", "sent", "failed", "suppressed", "queued"] as const;

const PAGE_SIZE = 25;

export function EmailDeliveriesTable() {
  const t = useTranslations("admin.settings.emails");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const query = useEmailDeliveries({
    status: statusFilter || undefined,
    limit: PAGE_SIZE,
  });

  // The backend returns the most recent `limit+1` — we slice the extra
  // off and use it to know whether there's another page.
  const allRows = useMemo<EmailDelivery[]>(
    () => query.data ?? [],
    [query.data],
  );

  // Client-side search across email / subject / template
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (d) =>
        d.to.toLowerCase().includes(q) ||
        d.subject.toLowerCase().includes(q) ||
        d.template.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  // Reset page when filters change
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  const canPrev = safePage > 0;
  const canNext = safePage < pageCount - 1;

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 flex-wrap">
        <h3 className="text-sm font-medium">{t("deliveries_title")}</h3>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className={cn(
            "ml-2 appearance-none px-2.5 py-1.5 text-xs rounded-md",
            "bg-background border border-border",
            "focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        >
          {STATUS_VALUES.map((v) => (
            <option key={v} value={v}>
              {v === ""
                ? t("deliveries_status_all")
                : t(`deliveries_status_${v}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={t("deliveries_search_placeholder")}
            className={cn(
              "w-full pl-7 pr-7 py-1.5 text-xs rounded-md",
              "bg-background border border-border",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t("deliveries_search_clear")}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {query.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("deliveries_loading")}
        </div>
      )}

      {/* Error */}
      {query.isError && (
        <div className="px-4 py-4 text-xs text-rose-500">
          {t("deliveries_load_error")}
        </div>
      )}

      {/* Empty */}
      {!query.isLoading && filtered.length === 0 && (
        <div className="px-4 py-10 text-center text-xs text-muted-foreground">
          {search || statusFilter
            ? t("deliveries_empty_filtered")
            : t("deliveries_empty")}
        </div>
      )}

      {/* Table */}
      {!query.isLoading && filtered.length > 0 && (
        <>
          <table className="w-full text-xs">
            <thead className="bg-card/60">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("deliveries_col_status")}</th>
                <th className="px-3 py-2 font-medium">{t("deliveries_col_to")}</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">
                  {t("deliveries_col_template")}
                </th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">
                  {t("deliveries_col_subject")}
                </th>
                <th className="px-3 py-2 font-medium text-right">
                  {t("deliveries_col_sent")}
                </th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {pageRows.map((d) => (
                <DeliveryRow key={d.id} delivery={d} t={t} />
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border/60 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {t("deliveries_range_of", {
                start: safePage * PAGE_SIZE + 1,
                end: Math.min((safePage + 1) * PAGE_SIZE, filtered.length),
                total: filtered.length,
              })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={!canPrev}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                  "border border-border hover:bg-accent/50",
                  "disabled:opacity-40 disabled:pointer-events-none",
                )}
              >
                <ChevronLeft className="w-3 h-3" />
                {t("deliveries_prev")}
              </button>
              <span className="px-2 tabular-nums">
                {t("deliveries_page_of", {
                  page: safePage + 1,
                  pages: pageCount,
                })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                  "border border-border hover:bg-accent/50",
                  "disabled:opacity-40 disabled:pointer-events-none",
                )}
              >
                {t("deliveries_next")}
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =====================================================================
// row
// =====================================================================

function DeliveryRow({
  delivery,
  t,
}: {
  delivery: EmailDelivery;
  t: ReturnType<typeof useTranslations>;
}) {
  const [copied, setCopied] = useState(false);
  const meta = STATUS_META[delivery.status];
  const Icon = meta.icon;

  const copyId = () => {
    void navigator.clipboard.writeText(delivery.id);
    setCopied(true);
    toast.success(t("deliveries_copied"));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <tr className="hover:bg-accent/20 transition-colors">
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("w-3.5 h-3.5 shrink-0", meta.tone)} />
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider",
              meta.tone,
            )}
          >
            {t(`deliveries_status_${delivery.status}` as Parameters<typeof t>[0])}
          </span>
          {delivery.attempt > 1 && (
            <span className="text-[9px] rounded border border-border px-1 py-0.5 text-muted-foreground">
              {t("deliveries_attempt_badge", { n: delivery.attempt })}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 max-w-[180px] truncate font-mono text-[11px]">
        {delivery.to}
      </td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <span className="font-mono text-[11px] text-muted-foreground">
          {delivery.template}
        </span>
      </td>
      <td className="px-3 py-2.5 hidden lg:table-cell max-w-[280px]">
        <div className="truncate">{delivery.subject}</div>
        {delivery.error && (
          <div className="text-[10px] text-rose-500 truncate mt-0.5">
            {delivery.error}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums whitespace-nowrap">
        {timeAgo(delivery.sent_at ?? delivery.created_at, t)}
      </td>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={copyId}
          title={t("deliveries_copy_id")}
          className="rounded p-1 text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover:opacity-100"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </td>
    </tr>
  );
}

// =====================================================================
// status meta
// =====================================================================

const STATUS_META: Record<
  EmailDelivery["status"],
  { icon: typeof CheckCircle2; tone: string }
> = {
  sent: { icon: CheckCircle2, tone: "text-emerald-500" },
  failed: { icon: XCircle, tone: "text-rose-500" },
  suppressed: { icon: Ban, tone: "text-muted-foreground" },
  queued: { icon: Clock, tone: "text-sky-500" },
  sending: { icon: AlertCircle, tone: "text-sky-500" },
};
