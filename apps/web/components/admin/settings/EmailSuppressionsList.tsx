"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Plus,
  Loader2,
  Ban,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  useEmailSuppressions,
  useSuppressEmail,
  useUnsuppressEmail,
  type EmailSuppression,
} from "@/lib/hooks/use-admin-emails";
import { timeAgo } from "@/components/admin/TicketBadges";

export function EmailSuppressionsList() {
  const t = useTranslations("admin.settings.emails");
  const query = useEmailSuppressions();
  const suppressMutation = useSuppressEmail();
  const unsuppressMutation = useUnsuppressEmail();

  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");
  const [pendingDelete, setPendingDelete] = useState<EmailSuppression | null>(
    null,
  );

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const canAdd = emailValid && !suppressMutation.isPending;

  const submitAdd = async () => {
    if (!canAdd) return;
    try {
      await suppressMutation.mutateAsync({
        email: newEmail.trim().toLowerCase(),
        reason: "admin_manual",
        note: newNote.trim() || undefined,
      });
      toast.success(
        t("supp_suppressed_toast", { email: newEmail.trim() }),
      );
      setNewEmail("");
      setNewNote("");
      setAdding(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("supp_suppress_failed"),
      );
    }
  };

  const confirmRemove = async () => {
    if (!pendingDelete) return;
    try {
      await unsuppressMutation.mutateAsync(pendingDelete.email);
      toast.success(
        t("supp_removed_toast", { email: pendingDelete.email }),
      );
      setPendingDelete(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("supp_remove_failed"),
      );
    }
  };

  const rows = query.data ?? [];

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="rounded-md bg-muted/40 p-1.5">
          <Ban className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t("supp_title")}</h3>
          <p className="text-[11px] text-muted-foreground">
            {t("supp_subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
            "border border-border bg-background hover:bg-accent/50 transition-colors",
            adding && "border-primary/40 bg-primary/5",
          )}
        >
          {adding ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {adding ? t("supp_cancel") : t("supp_add")}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-4 py-3 border-b border-border/60 bg-card/60">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {t("supp_email_label")}
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) void submitAdd();
                }}
                placeholder={t("supp_email_placeholder")}
                disabled={suppressMutation.isPending}
                autoFocus
                className={cn(
                  "w-full px-2.5 py-1.5 text-xs rounded-md",
                  "border border-border bg-background",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "disabled:opacity-60",
                  newEmail && !emailValid && "border-rose-500/50",
                )}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {t("supp_note_label")}
              </label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitAdd();
                }}
                placeholder={t("supp_note_placeholder")}
                disabled={suppressMutation.isPending}
                maxLength={500}
                className={cn(
                  "w-full px-2.5 py-1.5 text-xs rounded-md",
                  "border border-border bg-background",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "disabled:opacity-60",
                )}
              />
            </div>
            <button
              type="button"
              onClick={submitAdd}
              disabled={!canAdd}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              {suppressMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              {t("supp_suppress_button")}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {query.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("supp_loading")}
        </div>
      )}

      {/* Empty */}
      {!query.isLoading && rows.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          {t("supp_empty")}
        </div>
      )}

      {/* Rows */}
      {!query.isLoading && rows.length > 0 && (
        <ul className="divide-y divide-border/40">
          {rows.map((s) => (
            <li
              key={s.email}
              className="group flex items-start gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors"
            >
              <div className="shrink-0 w-6 h-6 rounded-md bg-muted/40 flex items-center justify-center mt-0.5">
                <Ban className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono truncate">{s.email}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                  <span className="rounded border border-border px-1 py-0.5 uppercase tracking-wider">
                    {s.reason.replace(/_/g, " ")}
                  </span>
                  {s.created_at && (
                    <span className="tabular-nums">
                      {t("supp_added_at", {
                        when: timeAgo(s.created_at, t),
                      })}
                    </span>
                  )}
                </div>
                {s.note && (
                  <div className="text-[11px] text-muted-foreground mt-1 break-words">
                    {s.note}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(s)}
                className={cn(
                  "rounded-md p-1.5 transition-colors shrink-0 mt-0.5",
                  "text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10",
                  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                )}
                aria-label={t("supp_remove_aria", { email: s.email })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Confirm remove */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("supp_confirm_title")}
        description={
          pendingDelete
            ? t("supp_confirm_body", { email: pendingDelete.email })
            : ""
        }
        confirmLabel={t("supp_confirm_button")}
        cancelLabel={t("supp_cancel")}
        destructive
        onConfirm={confirmRemove}
        busy={unsuppressMutation.isPending}
      />
    </div>
  );
}
