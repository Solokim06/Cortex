"use client";

import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Link } from "@/i18n/navigation";
import { cn } from "cn";
import { User as UserIcon, Flame, Trash2, RotateCcw } from "lucide-react";
import {
  CategoryBadge,
  PriorityBadge,
  StatusBadge,
  formatDuration,
  timeAgo,
} from "./TicketBadges";
import type { TicketSummary } from "@/lib/admin-api";
import {
  useHideTicket,
  useRestoreTicket,
} from "@/lib/hooks/use-admin-tickets";
import { useNow } from "@/lib/hooks/use-now";

type Props = {
  ticket: TicketSummary;
  selected: boolean;
  onToggleSelect: (id: string) => void;
};

/**
 * One row in the admin tickets table.
 *
 * Design notes:
 * - Fixed grid on desktop, stacked on mobile.
 * - The whole row links to /admin/tickets/{id}, except the checkbox.
 * - SLA breach indicator shows in the time column when overdue.
 */
export const TicketRow = memo(function TicketRow({
  ticket,
  selected,
  onToggleSelect,
}: Props) {
  const t = useTranslations("admin.tickets");
  const isBreached = ticket.breached;

  // Compute "time remaining until first-response due" for display.
  // Negative = overdue. `now` refreshes on window focus (see use-now.ts)
  // so the label stays reasonably fresh without a per-row interval.
  const now = useNow();
  let slaText = "";
  let slaTone = "text-muted-foreground";
  if (ticket.first_response_due_at) {
    const dueMs = new Date(ticket.first_response_due_at).getTime();
    const diffSec = Math.floor((dueMs - now) / 1000);

    // Only show if open/in_progress (terminal states don't need a due label)
    if (ticket.status === "open" || ticket.status === "in_progress") {
      if (diffSec < 0) {
        slaText = `${t("overdue", { duration: formatDuration(-diffSec, t) })}`;
        slaTone = "text-rose-500";
      } else if (diffSec < 3600) {
        slaText = `${t("due_in", { duration: formatDuration(diffSec, t) })}`;
        slaTone = "text-amber-500";
      }
    }
  }

  return (
    <div
      className={cn(
        "group grid items-center gap-3 px-4 py-3 border-b border-border/50 transition-colors",
        "grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_120px_140px_140px_120px_40px]",
        "hover:bg-accent/20",
        selected && "bg-primary/5",
      )}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(ticket.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={t("select_ticket_aria", { subject: ticket.subject })}
        className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
      />

      {/* Main content — clickable link */}
      <Link
        href={`/admin/tickets/${ticket.id}`}
        className="min-w-0 flex flex-col gap-1 md:contents"
      >
        {/* Subject + meta (mobile-first: stacks) */}
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2 min-w-0">
            {isBreached && (
              <Flame
                className="w-3.5 h-3.5 text-rose-500 shrink-0"
                aria-label={t("sla_breached_aria")}
              />
            )}
            <p className="text-sm font-medium truncate group-hover:text-foreground">
              {ticket.subject}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <CategoryBadge category={ticket.category} />
            <span className="opacity-40">·</span>
            <span className="truncate max-w-[180px]">
              {ticket.filer?.email ?? t("filer_unknown")}
            </span>
          </div>

          {/* Mobile-only extra info */}
          <div className="md:hidden flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>{timeAgo(ticket.updated_at, t)}</span>
            {slaText && <span className={slaTone}>{slaText}</span>}
            {ticket.assignee ? (
              <span className="truncate">
                → {ticket.assignee.name ?? ticket.assignee.email}
              </span>
            ) : (
              <span className="italic opacity-70">{t("unassigned_inline")}</span>
            )}
          </div>
        </div>

        {/* Desktop columns — status already shown above; show assignee */}

        {/* Assignee column (desktop only) */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          {ticket.assignee ? (
            <>
              <UserIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {ticket.assignee.name ?? ticket.assignee.email}
              </span>
            </>
          ) : (
            <span className="italic opacity-60">{t("unassigned_inline")}</span>
          )}
        </div>

        {/* SLA column (desktop only) */}
        <div
          className={cn(
            "hidden md:block text-xs tabular-nums",
            slaTone,
          )}
        >
          {slaText || "—"}
        </div>

        {/* Updated column (desktop only) */}
        <div className="hidden md:block text-xs text-muted-foreground tabular-nums">
          {timeAgo(ticket.updated_at, t)}
        </div>
      </Link>

      {/* Actions column — hide / restore. Only for resolved/closed
          tickets, since active tickets shouldn't be cleared. */}
      <div className="hidden md:flex items-center justify-end">
        <RowAction ticket={ticket} />
      </div>
    </div>
  );
});


// =====================================================================
// Row action — trash (hide) if resolved/closed, restore if hidden
// =====================================================================

function RowAction({ ticket }: { ticket: TicketSummary }) {
  const t = useTranslations("admin.tickets");
  const hideMutation = useHideTicket(ticket.id);
  const restoreMutation = useRestoreTicket(ticket.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isHidden = !!ticket.hidden_from_admin_at;
  const canHide = ticket.status === "resolved" || ticket.status === "closed";

  if (isHidden) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          restoreMutation.mutate(undefined, {
            onSuccess: () => toast.success(t("restore_success")),
            onError: () => toast.error(t("restore_failed")),
          });
        }}
        disabled={restoreMutation.isPending}
        title={t("restore_title")}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-40 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    );
  }

  if (!canHide) return null;

  const performClear = async () => {
    try {
      await hideMutation.mutateAsync(undefined);
      toast.success(t("hide_success"));
      setConfirmOpen(false);
    } catch {
      toast.error(t("hide_failed"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        disabled={hideMutation.isPending}
        title={t("hide_title")}
        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("hide_confirm_title")}
        description={t("hide_confirm_body", { subject: ticket.subject })}
        confirmLabel={t("hide_confirm_button")}
        cancelLabel={t("cancel")}
        destructive
        busy={hideMutation.isPending}
        onConfirm={performClear}
      />
    </>
  );
}
