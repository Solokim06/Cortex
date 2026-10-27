"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  Sparkles,
  MessageSquare,
  X,
} from "lucide-react";
import { cn } from "cn";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

type Props = {
  messages: ConversationMessage[];
  /** Called when the user wants to remove the attached transcript */
  onRemove?: () => void;
  /** Start expanded? Default: false */
  defaultExpanded?: boolean;
};

/**
 * Collapsible preview of a chat transcript attached to a ticket.
 *
 * Used in two places:
 *  1. Inside the FeedbackDialog before submission (with onRemove)
 *  2. Inside the TicketDrawer + admin TicketTimeline (read-only)
 */
export function ConversationPreview({
  messages,
  onRemove,
  defaultExpanded = false,
}: Props) {
  const t = useTranslations("help.feedback.attached");
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (messages.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <MessageSquare className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium truncate">
            {t("title", { count: messages.length })}
          </span>
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
            aria-label={t("removeAria")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-border/60 px-3 py-2.5 space-y-2 max-h-72 overflow-y-auto">
          {messages.map((m, idx) => (
            <TranscriptBubble key={idx} message={m} />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// one message
// =====================================================================

function TranscriptBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  const Icon = isUser ? UserIcon : Sparkles;

  return (
    <div className="flex gap-2">
      <div
        className={cn(
          "shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-accent text-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="w-3 h-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isUser ? "User" : "Cortex"}
          </span>
          {message.created_at && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {new Date(message.created_at).toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-xs whitespace-pre-wrap wrap-break-word text-foreground/85 leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}
