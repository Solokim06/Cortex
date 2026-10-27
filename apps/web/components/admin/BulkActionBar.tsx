"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Loader2,
  Tag as TagIcon,
  UserCheck,
  Flag,
  CheckCircle2,
  CircleDot,
  UserX,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "cn";
import {
  useBulkUpdateTickets,
  useBulkHideTickets,
} from "@/lib/hooks/use-admin-tickets";
import type {
  BulkUpdatePayload,
  TicketPriority,
  TicketStatus,
} from "@/lib/admin-api";

type Props = {
  selectedIds: string[];
  onDone: (result: {
    updated: number;
    skipped: number;
    errors: { id: string; reason: string }[];
  }) => void;
  onCancel: () => void;
};

/**
 * Floating bulk-action bar. Renders inline above the ticket list.
 *
 * Fields are independent: admin can set a status AND a priority AND
 * assign in one shot. Clicking Apply fires POST /admin/tickets/bulk
 * with whatever combination is filled in.
 */
export function BulkActionBar({ selectedIds, onDone, onCancel }: Props) {
  const t = useTranslations("admin.tickets.bulk");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<TicketPriority | "">("");
  const [assignee, setAssignee] = useState<"" | "me" | "none">("");
  const [tagInput, setTagInput] = useState("");

  const bulkMutation = useBulkUpdateTickets();
  const hideMutation = useBulkHideTickets();

  const hasAnyChange =
    status !== "" || priority !== "" || assignee !== "" || tagInput.trim() !== "";

  const handleApply = async () => {
    if (!hasAnyChange) return;

    const payload: BulkUpdatePayload = { ticket_ids: selectedIds };
    if (status) payload.status = status;
    if (priority) payload.priority = priority;
    if (assignee === "me") payload.assign_to_me = true;
    if (assignee === "none") payload.assign_to_user_id = "";
    if (tagInput.trim()) payload.add_tag = tagInput.trim().toLowerCase();

    try {
      const result = await bulkMutation.mutateAsync(payload);
      onDone(result);
      // Reset fields
      setStatus("");
      setPriority("");
      setAssignee("");
      setTagInput("");
    } catch {
      // The parent already surfaces toasts; keep the bar open.
    }
  };

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const handleClear = async () => {
    setConfirmClearOpen(true);
  };

  const performClear = async () => {
    try {
      const result = await hideMutation.mutateAsync(selectedIds);
      onDone({
        updated: result.hidden,
        skipped: result.skipped.length,
        errors: result.skipped.map((s) => ({
          id: s.id,
          reason: s.reason ?? "not_clearable",
        })),
      });
      setConfirmClearOpen(false);
    } catch {
      // toast handled by parent
    }
  };

  const busy = bulkMutation.isPending || hideMutation.isPending;
  const count = selectedIds.length;

  return (
    <div
      className={cn(
        "sticky top-0 z-20 border-b border-primary/30 bg-primary/5",
        "backdrop-blur-sm",
      )}
      role="region"
      aria-label={t("aria_bulk_actions")}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
        <CircleDot className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-medium tabular-nums">
          {t("selected_count", { n: count })}
        </span>

        <div className="w-px h-4 bg-border mx-1" aria-hidden />

        {/* Status */}
        <label className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
          <span className="sr-only">{t("sr_set_status")}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TicketStatus | "")}
            disabled={busy}
            className={selectCls}
          >
            <option value="">{t("status_placeholder")}</option>
            <option value="open">{t("status_open")}</option>
            <option value="in_progress">{t("status_in_progress")}</option>
            <option value="resolved">{t("status_resolved")}</option>
            <option value="closed">{t("status_closed")}</option>
          </select>
        </label>

        {/* Priority */}
        <label className="flex items-center gap-1.5">
          <Flag className="w-3 h-3 text-muted-foreground" />
          <span className="sr-only">{t("sr_set_priority")}</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority | "")}
            disabled={busy}
            className={selectCls}
          >
            <option value="">{t("priority_placeholder")}</option>
            <option value="urgent">{t("priority_urgent")}</option>
            <option value="high">{t("priority_high")}</option>
            <option value="normal">{t("priority_normal")}</option>
            <option value="low">{t("priority_low")}</option>
          </select>
        </label>

        {/* Assignee */}
        <label className="flex items-center gap-1.5">
          <UserCheck className="w-3 h-3 text-muted-foreground" />
          <span className="sr-only">{t("sr_assign_to")}</span>
          <select
            value={assignee}
            onChange={(e) =>
              setAssignee(e.target.value as "" | "me" | "none")
            }
            disabled={busy}
            className={selectCls}
          >
            <option value="">{t("assign_placeholder")}</option>
            <option value="me">{t("assign_me")}</option>
            <option value="none">{t("assign_unassign")}</option>
          </select>
        </label>

        {/* Tag */}
        <label className="flex items-center gap-1.5 min-w-[140px]">
          <TagIcon className="w-3 h-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder={t("tag_placeholder")}
            disabled={busy}
            maxLength={64}
            className={cn(
              "w-full px-2 py-1 rounded border border-border bg-background",
              "text-xs focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          />
        </label>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={!hasAnyChange || busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {busy ? t("applying") : t("apply")}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            title={t("clear_title")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
              "border border-border hover:bg-rose-500/10 hover:text-rose-500",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            <Trash2 className="w-3 h-3" />
            {t("clear")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs",
              "border border-border hover:bg-accent/50",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            <X className="w-3 h-3" />
            {t("clear")}
          </button>
        </div>
      </div>

      {/* Hint line */}
      <div className="px-4 pb-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UserX className="w-3 h-3 opacity-60" />
          {t("hint")}
        </span>
      </div>
    
      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title={t("confirm_clear_title", { n: selectedIds.length })}
        description={t("confirm_clear_body")}
        confirmLabel={t("clear")}
        cancelLabel={t("cancel")}
        destructive
        busy={hideMutation.isPending}
        onConfirm={performClear}
      />
</div>
  );
}

// =====================================================================
// shared select class
// =====================================================================

const selectCls = cn(
  "appearance-none px-2 py-1 text-xs rounded border border-border bg-background",
  "focus:outline-none focus:ring-1 focus:ring-ring",
  "disabled:opacity-50",
);
