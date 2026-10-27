"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Loader2,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Sparkles,
  User as UserIcon,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Markdown } from "@/components/chat/Markdown";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/hooks/use-now";
import {
  useReplyToTicket,
  useTicketDetail,
  useEditReply,
  type UserTicket,
} from "@/lib/hooks/use-help";
import { ConversationPreview } from "./ConversationPreview";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  /** null = closed */
  ticketId: string | null;
  onClose: () => void;
};

/**
 * Slide-in drawer showing one of the user's own tickets:
 *   - header (subject, status badge)
 *   - description (filer's original message)
 *   - timeline of user + team replies
 *   - reply box at the bottom
 *
 * Uses the same visual language as the admin TicketTimeline — bubbles
 * for messages, compact rows for status changes.
 */
export function TicketDrawer({ ticketId, onClose }: Props) {
  const t = useTranslations("help.tickets.detail");
  const tStatus = useTranslations("help.tickets");

  const detailQuery = useTicketDetail(ticketId, {
    // Poll fast while waiting for the AI's first reply. Once a reply
    // arrives, the query stops refetching (the interval function runs
    // on every render, so it picks up the new replies count).
    refetchInterval: (() => 2000) as unknown as number,
  });

  if (!ticketId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 w-full sm:max-w-xl",
          "bg-popover border-l border-border shadow-2xl",
          "flex flex-col",
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <header className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-border">
          <div className="rounded-md bg-primary/10 p-1.5 mt-0.5">
            <MessageSquare className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {detailQuery.data?.subject ?? t("loading")}
            </div>
            {detailQuery.data && (
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge
                  status={detailQuery.data.status as UserTicket["status"]}
                  label={tStatus(`status_${detailQuery.data.status}` as never)}
                />
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  #{detailQuery.data.id.slice(0, 8)}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0"
            aria-label={t("drawer_close_aria")}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {detailQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("loading")}
            </div>
          )}

          {detailQuery.isError && (
            <div className="mx-4 my-4 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
              {t("drawer_load_error")}
            </div>
          )}

          {detailQuery.data && (
            <>
              {/* Original description */}
              <section className="px-4 py-3 border-b border-border/60 bg-card/20">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  {t("originalMessage")}
                </div>
                <p className="text-sm whitespace-pre-wrap wrap-break-word text-foreground/90">
                  {detailQuery.data.description}
                </p>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {formatDate(detailQuery.data.created_at, t)}
                </div>

                {detailQuery.data.attached_conversation &&
                  detailQuery.data.attached_conversation.length > 0 && (
                    <div className="mt-3">
                      <ConversationPreview
                        messages={detailQuery.data.attached_conversation}
                      />
                    </div>
                  )}
              </section>

              {/* Timeline */}
              <section className="px-4 py-3 space-y-3">
                {detailQuery.data.replies.length === 0 && (
                  <AiDraftingPlaceholder
                    createdAt={detailQuery.data.created_at}
                  />
                )}

                {detailQuery.data.replies.map((reply) => (
                  <ReplyBubble
                    key={reply.id}
                    ticketId={ticketId!}
                    replyId={reply.id}
                    author={reply.author}
                    content={reply.content}
                    createdAt={reply.created_at}
                    editedAt={reply.edited_at ?? null}
                    labelUser={t("author_user")}
                    labelTeam={t("author_team")}
                  />
                ))}
              </section>
            </>
          )}
        </div>

        {/* Reply box — only when detail is loaded */}
        {detailQuery.data && (
          <ReplyBox
            ticketId={ticketId}
            onSent={() => {
              // Optimistically refetch the ticket so the new reply shows up
              detailQuery.refetch();
            }}
          />
        )}
      </aside>
    </>
  );
}

// =====================================================================
// reply bubble
// =====================================================================

const EDIT_WINDOW_MS = 30 * 60 * 1000;

function ReplyBubble({
  ticketId,
  replyId,
  author,
  content,
  createdAt,
  editedAt,
  labelUser,
  labelTeam,
}: {
  ticketId: string;
  replyId: string;
  author: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  labelUser: string;
  labelTeam: string;
}) {
  const t = useTranslations("help.tickets.detail");
  const isUser = author === "user";
  const isNote = author === "note";
  const isTeam = author === "team" || isNote;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const editMutation = useEditReply(ticketId);
  const now = useNow();

  const ageMs = now - new Date(createdAt).getTime();
  const canEdit = isUser && ageMs < EDIT_WINDOW_MS && !editedAt;

  const handleSave = () => {
    const clean = draft.trim();
    if (!clean || clean === content) {
      setEditing(false);
      setDraft(content);
      return;
    }
    editMutation.mutate(
      { replyId, content: clean },
      {
        onSuccess: () => {
          toast.success(t("edit_message_updated"));
          setEditing(false);
        },
        onError: (err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : t("edit_failed"),
          );
        },
      },
    );
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(content);
  };

  if (isNote) {
    // Notes shouldn't appear for end-users, but guard anyway.
    return null;
  }

  // ---- Edit mode ----
  if (editing) {
    return (
      <div className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
        <div className="flex flex-col min-w-0 max-w-[80%] w-full">
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5",
              isUser
                ? "bg-primary/10 border border-primary/30 rounded-br-md"
                : "bg-card/60 border border-border rounded-bl-md",
            )}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") handleCancel();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className="w-full bg-transparent text-sm resize-none outline-none focus:ring-0"
            />
            <div className="mt-2 flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                disabled={editMutation.isPending}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                {t("edit_cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={editMutation.isPending || !draft.trim()}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-40 disabled:pointer-events-none",
                )}
              >
                {editMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                {t("edit_save")}
              </button>
            </div>
          </div>
          <span className="mt-1 px-1 text-[10px] text-muted-foreground self-end">
            {t("edit_hint")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2.5",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {isTeam && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
      )}

      <div className="flex flex-col min-w-0 max-w-[80%] group/bubble">
        <div
          className={cn(
            "relative rounded-2xl px-3.5 py-2.5 text-sm wrap-break-word",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap"
              : "bg-card/60 border border-border rounded-bl-md",
          )}
        >
          {isTeam ? <Markdown content={content} /> : content}

          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title={t("edit_title")}
              className={cn(
                "absolute -top-2 -left-2 opacity-0 group-hover/bubble:opacity-100",
                "w-6 h-6 rounded-full bg-background border border-border",
                "inline-flex items-center justify-center",
                "text-muted-foreground hover:text-foreground hover:border-primary/40",
                "transition-all duration-150",
              )}
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        <div
          className={cn(
            "mt-1 px-1 text-[10px] text-muted-foreground",
            isUser ? "text-right" : "text-left",
          )}
        >
          {isUser ? labelUser : labelTeam} · {formatDate(createdAt, t)}
          {editedAt && (
            <span
              className="ml-1 italic opacity-70"
              title={t("edited_at_title", { when: formatDate(editedAt, t) })}
            >
              {t("edited_label")}
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-accent flex items-center justify-center mt-0.5">
          <UserIcon className="w-3.5 h-3.5 text-foreground" />
        </div>
      )}
    </div>
  );
}

// =====================================================================
// reply box
// =====================================================================

function ReplyBox({
  ticketId,
  onSent,
}: {
  ticketId: string;
  onSent: () => void;
}) {
  const t = useTranslations("help.tickets.detail");
  const [draft, setDraft] = useState("");
  const [prevSentAt, setPrevSentAt] = useState(0);
  const replyMutation = useReplyToTicket(ticketId);
  const qc = useQueryClient();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const send = async () => {
    const content = draft.trim();
    if (!content || replyMutation.isPending) return;

    try {
      await replyMutation.mutateAsync(content);
      toast.success(t("sent"));
      setDraft("");
      setPrevSentAt(Date.now());
      qc.invalidateQueries({ queryKey: ["my-help-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["my-help-tickets"] });
      onSent();
    } catch {
      toast.error(t("errorSending"));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // Suppress unused var warning — prevSentAt is used as a debounce marker
  void prevSentAt;

  return (
    <div className="shrink-0 border-t border-border bg-card/20 px-3 py-3">
      <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:border-primary/40 transition-colors">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("replyPlaceholder")}
          rows={1}
          disabled={replyMutation.isPending}
          className="flex-1 min-h-9 max-h-40 resize-none border-0 bg-transparent p-1.5 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
        />
        <Button
          type="button"
          size="icon"
          onClick={send}
          disabled={!draft.trim() || replyMutation.isPending}
          className="h-8 w-8 shrink-0 mb-0.5"
          aria-label={t("send")}
        >
          {replyMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
        {t("reply_hint")}
      </p>
    </div>
  );
}

// =====================================================================
// status badge
// =====================================================================

function StatusBadge({
  status,
  label,
}: {
  status: UserTicket["status"];
  label: string;
}) {
  const meta = {
    open: {
      icon: AlertCircle,
      tone: "text-amber-600 dark:text-amber-400 border-amber-500/40",
    },
    in_progress: {
      icon: Clock,
      tone: "text-sky-600 dark:text-sky-400 border-sky-500/40",
    },
    resolved: {
      icon: CheckCircle2,
      tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/40",
    },
    closed: {
      icon: XCircle,
      tone: "text-muted-foreground border-border",
    },
  }[status];

  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 inline-flex items-center gap-1",
        meta.tone,
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// =====================================================================
// helpers
// =====================================================================

function formatDate(
  iso: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return t("time_just_now");
  if (diff < 3600) return t("time_minutes", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("time_hours", { n: Math.floor(diff / 3600) });
  if (diff < 604800) return t("time_days", { n: Math.floor(diff / 86400) });
  return d.toLocaleDateString();
}


// =====================================================================
// AI drafting placeholder — shown for the first ~90s after filing
// until the pipeline posts the AI's first reply.
// =====================================================================

function AiDraftingPlaceholder({ createdAt }: { createdAt: string }) {
  const t = useTranslations("help.tickets.detail");
  const now = useNow();
  const ageMs = now - new Date(createdAt).getTime();
  const fresh = ageMs < 90_000;

  if (!fresh) {
    return (
      <p className="text-xs text-muted-foreground italic text-center py-4">
        {t("no_replies")}
      </p>
    );
  }

  return (
    <div className="flex gap-2.5 justify-start">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
      </div>
      <div className="flex flex-col min-w-0 max-w-[80%]">
        <div className="rounded-2xl rounded-bl-md bg-card/60 border border-border px-3.5 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {t("ai_drafting")}
          </span>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t("ai_drafting_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
