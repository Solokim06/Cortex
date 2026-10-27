"use client";

import { useMemo } from "react";
import {
  User as UserIcon,
  Sparkles,
  StickyNote,
  CheckCircle2,
  Clock,
  UserPlus,
  Flag,
  Tag as TagIcon,
  Flame,
  Wrench,
  ShieldAlert,
  Circle,
} from "lucide-react";
import { cn } from "cn";
import { ConversationPreview } from "@/components/help/ConversationPreview";
import type { TicketDetail, TicketEvent, TicketReply } from "@/lib/admin-api";
import { Markdown } from "@/components/chat/Markdown";

// =====================================================================
// unified timeline item
// =====================================================================

type TimelineItem =
  | { type: "reply"; at: string; reply: TicketReply }
  | { type: "event"; at: string; event: TicketEvent };

type Props = {
  ticket: TicketDetail;
};

/**
 * Chronological feed of replies + events.
 *
 * Design goal: readable at a glance. Replies get full message bubbles
 * (chat-style); system events get compact single-line chips so the
 * conversation stays dominant.
 */
export function TicketTimeline({ ticket }: Props) {
  const items: TimelineItem[] = useMemo(() => {
    const combined: TimelineItem[] = [
      ...ticket.replies.map(
        (r) => ({ type: "reply" as const, at: r.created_at, reply: r }),
      ),
      ...ticket.events.map(
        (e) => ({ type: "event" as const, at: e.created_at, event: e }),
      ),
    ];
    combined.sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    return combined;
  }, [ticket.replies, ticket.events]);

  const attached = ticket.attached_conversation ?? [];

  if (items.length === 0 && attached.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
        <Circle className="w-6 h-6 opacity-40" />
        <p className="text-sm">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 py-4">
      {attached.length > 0 && (
        <div className="pb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Attached conversation
          </p>
          <ConversationPreview messages={attached} defaultExpanded={false} />
        </div>
      )}
      {items.map((item) => {
        if (item.type === "reply") {
          return <ReplyBubble key={`r-${item.reply.id}`} reply={item.reply} />;
        }
        return <EventLine key={`e-${item.event.id}`} event={item.event} />;
      })}
    </div>
  );
}

// =====================================================================
// reply bubble
// =====================================================================

function ReplyBubble({ reply }: { reply: TicketReply }) {
  const isUser = reply.author === "user";
  const isNote = reply.author === "note";
  const isTeam = reply.author === "team";

  if (isNote) {
    return <NoteBubble reply={reply} />;
  }

  return (
    <div
      className={cn(
        "flex gap-3 w-full",
        isUser ? "justify-start" : "justify-end",
      )}
    >
      {/* Left icon for user */}
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-accent flex items-center justify-center mt-0.5">
          <UserIcon className="w-3.5 h-3.5 text-foreground" />
        </div>
      )}

      <div className="flex flex-col min-w-0 max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm break-words",
            isUser
              ? "bg-card/60 border border-border rounded-bl-md whitespace-pre-wrap"
              : "bg-primary text-primary-foreground rounded-br-md",
          )}
        >
          {isTeam ? <Markdown content={reply.content} /> : reply.content}
        </div>
        <div
          className={cn(
            "mt-1 px-1 text-[10px] text-muted-foreground",
            isUser ? "text-left" : "text-right",
          )}
        >
          {isUser ? "User" : "Team"} ·{" "}
          {new Date(reply.created_at).toLocaleString()}
        </div>
      </div>

      {/* Right icon for team */}
      {isTeam && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
    </div>
  );
}

// =====================================================================
// internal note bubble (visually distinct)
// =====================================================================

function NoteBubble({ reply }: { reply: TicketReply }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <StickyNote className="w-3 h-3 text-amber-500" />
        <span className="text-[10px] uppercase tracking-wider text-amber-500">
          Internal note · not visible to user
        </span>
      </div>
      <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">
        {reply.content}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {new Date(reply.created_at).toLocaleString()}
      </div>
    </div>
  );
}

// =====================================================================
// event line (compact chip)
// =====================================================================

function EventLine({ event }: { event: TicketEvent }) {
  const meta = eventMeta(event);
  if (!meta) return null; // unknown / internal events are hidden

  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-1">
      <Icon className={cn("w-3 h-3 shrink-0", meta.tone)} />
      <span className="truncate">{meta.text}</span>
      <span className="opacity-50">·</span>
      <span className="opacity-70 shrink-0">
        {new Date(event.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}

// =====================================================================
// event → icon + text
// =====================================================================

function eventMeta(event: TicketEvent): {
  icon: typeof CheckCircle2;
  text: string;
  tone: string;
} | null {
  const d = event.data ?? {};

  switch (event.kind) {
    case "created":
      return {
        icon: Circle,
        text: "Ticket created",
        tone: "text-muted-foreground",
      };

    case "status_changed":
      return {
        icon: CheckCircle2,
        text: `Status: ${d.from ?? "?"} → ${d.to ?? "?"}`,
        tone: "text-sky-500",
      };

    case "priority_changed":
      return {
        icon: Flag,
        text: `Priority: ${d.from ?? "?"} → ${d.to ?? "?"}`,
        tone: "text-orange-500",
      };

    case "assigned": {
      const from = d.from ? String(d.from).slice(0, 8) : "nobody";
      const to = d.to ? String(d.to).slice(0, 8) : "nobody";
      return {
        icon: UserPlus,
        text: `Assignee: ${from} → ${to}`,
        tone: "text-violet-500",
      };
    }

    case "tag_added":
      return {
        icon: TagIcon,
        text: `Tag added: ${d.tag ?? "?"}`,
        tone: "text-muted-foreground",
      };

    case "tag_removed":
      return {
        icon: TagIcon,
        text: `Tag removed: ${d.tag ?? "?"}`,
        tone: "text-muted-foreground",
      };

    case "sla_breached":
      return {
        icon: Flame,
        text: `SLA breached (${d.category ?? "unknown"})`,
        tone: "text-rose-500",
      };

    case "sla_recomputed":
      return {
        icon: Clock,
        text: "SLA recomputed",
        tone: "text-muted-foreground",
      };

    case "impersonated_action":
      return {
        icon: ShieldAlert,
        text: "Action performed via impersonation",
        tone: "text-rose-400",
      };

    case "user_redacted":
      return {
        icon: Wrench,
        text: "User data redacted",
        tone: "text-muted-foreground",
      };

    default:
      // Unknown event kinds — surface them (safer than hiding), but keep it
      // visually quiet so the conversation stays the focus.
      return {
        icon: Wrench,
        text: event.kind.replace(/_/g, " "),
        tone: "text-muted-foreground",
      };
  }
}