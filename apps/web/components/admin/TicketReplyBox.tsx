"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Send,
  StickyNote,
  MessageSquare,
  Sparkles,
  Loader2,
  Command,
  CornerDownLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { MacroPicker } from "./MacroPicker";
import {
  usePostInternalNote,
  usePostTeamReply,
} from "@/lib/hooks/use-admin-tickets";
import type { TicketDetail } from "@/lib/admin-api";

type Mode = "reply" | "note";

type Props = {
  ticket: TicketDetail;
};

/**
 * Compose box for the ticket detail page.
 *
 * Modes:
 *   - Reply → user-visible message (posts as author="team")
 *   - Note  → internal note (posts as author="note", hidden from user)
 *
 * Shortcuts:
 *   - Cmd/Ctrl + Enter: send
 *   - Esc: clear draft (only when empty-ish; otherwise blur)
 *
 * Macro picker: opens a popover of canned responses. Selecting one
 * loads it into the textarea (rendered with ticket context) — the admin
 * can then edit before sending.
 */
export function TicketReplyBox({ ticket }: Props) {
  const t = useTranslations("admin.tickets.replybox");
  const [mode, setMode] = useState<Mode>("reply");
  const [draft, setDraft] = useState("");
  const [showMacroPicker, setShowMacroPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const replyMutation = usePostTeamReply(ticket.id);
  const noteMutation = usePostInternalNote(ticket.id);

  const busy = replyMutation.isPending || noteMutation.isPending;

  // --- auto-grow textarea ---
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [draft]);

  // --- focus textarea when mode changes ---
  useEffect(() => {
    // Small delay so the textarea is mounted after the tab switch
    const t = setTimeout(() => textareaRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [mode]);

  const send = async () => {
    const content = draft.trim();
    if (!content || busy) return;

    try {
      if (mode === "reply") {
        await replyMutation.mutateAsync(content);
        toast.success(t("toast_reply_sent"));
      } else {
        await noteMutation.mutateAsync(content);
        toast.success(t("toast_note_added"));
      }
      setDraft("");
      setShowMacroPicker(false);
    } catch {
      toast.error(t("toast_send_failed"));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send();
      return;
    }
    if (e.key === "Escape") {
      // Clear only if there's a short draft, otherwise blur
      if (draft.length < 50) {
        setDraft("");
      } else {
        textareaRef.current?.blur();
      }
    }
  };

  const placeholder =
    mode === "reply"
      ? t("placeholder_reply")
      : t("placeholder_note");

  const sendLabel =
    mode === "reply" ? t("send_reply") : t("send_note");

  return (
    <div className="border-t border-border bg-card/30 px-4 py-3">
      {/* Tab strip */}
      <div className="flex items-center gap-1 mb-2">
        <ModeTab
          active={mode === "reply"}
          onClick={() => setMode("reply")}
          icon={MessageSquare}
          label={t("tab_reply")}
        />
        <ModeTab
          active={mode === "note"}
          onClick={() => setMode("note")}
          icon={StickyNote}
          label={t("tab_note")}
          tone="amber"
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMacroPicker((s) => !s)}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
              "border border-border bg-background hover:bg-accent/50 transition-colors",
              "disabled:opacity-40 disabled:pointer-events-none",
              showMacroPicker && "border-primary/60 bg-primary/5",
            )}
          >
            <Sparkles className="w-3 h-3" />
            {t("macros_button")}
          </button>
        </div>
      </div>

      {/* Macro picker (renders above the textarea) */}
      {showMacroPicker && (
        <MacroPicker
          ticketId={ticket.id}
          onSelect={(rendered) => {
            setDraft((prev) => (prev ? prev + "\n\n" + rendered : rendered));
            setShowMacroPicker(false);
            setTimeout(() => {
              textareaRef.current?.focus();
              const len = textareaRef.current?.value.length ?? 0;
              textareaRef.current?.setSelectionRange(len, len);
            }, 20);
          }}
          onClose={() => setShowMacroPicker(false)}
        />
      )}

      {/* Textarea */}
      <div
        className={cn(
          "rounded-lg border bg-background transition-colors",
          mode === "note"
            ? "border-amber-500/40 focus-within:border-amber-500/60"
            : "border-border focus-within:border-ring",
        )}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={busy}
          rows={2}
          className={cn(
            "w-full resize-none bg-transparent px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none disabled:opacity-60",
            "min-h-[60px] max-h-[280px]",
          )}
        />

        {/* Footer: hint + send */}
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-muted/40 px-1 py-0.5 font-mono">
              <Command className="w-2.5 h-2.5" />
              <CornerDownLeft className="w-2.5 h-2.5" />
            </kbd>
            <span>{t("hint_send")}</span>
            {mode === "note" && (
              <span className="text-amber-500">
                · {t("hint_note_only")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              mode === "note"
                ? "bg-amber-500 text-black hover:bg-amber-500/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            {busy ? t("sending") : sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// mode tab
// =====================================================================

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
  tone = "primary",
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MessageSquare;
  label: string;
  tone?: "primary" | "amber";
}) {
  const activeCls =
    tone === "amber"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
      : "border-primary/50 bg-primary/10 text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors border",
        active
          ? activeCls
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30",
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
