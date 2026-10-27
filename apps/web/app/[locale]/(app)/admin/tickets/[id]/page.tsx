"use client";

import { useTranslations } from "next-intl";

import { use } from "react";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import { TicketSidebar } from "@/components/admin/TicketSidebar";
import { TicketTimeline } from "@/components/admin/TicketTimeline";
import { TicketReplyBox } from "@/components/admin/TicketReplyBox";
import { TriagePanel } from "@/components/admin/TriagePanel";
import {
  CategoryBadge,
  PriorityBadge,
  StatusBadge,
  timeAgo,
} from "@/components/admin/TicketBadges";
import { useAdminTicket } from "@/lib/hooks/use-admin-tickets";

/**
 * Ticket detail page.
 *
 * Layout (desktop):
 *   ┌─────────────────────────────────────┬──────────────┐
 *   │ Header (subject, badges, filer)     │              │
 *   ├─────────────────────────────────────┤              │
 *   │ Description + attachment            │              │
 *   ├─────────────────────────────────────┤  Sidebar     │
 *   │ Triage panel (collapsible)          │  (Properties │
 *   ├─────────────────────────────────────┤   Tags, SLA, │
 *   │ Timeline (scrolls)                  │   Context)   │
 *   ├─────────────────────────────────────┤              │
 *   │ Reply / Note compose box            │              │
 *   └─────────────────────────────────────┴──────────────┘
 *
 * On mobile the sidebar stacks below the timeline.
 */
export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("admin.tickets");
  const tD = useTranslations("admin.tickets.detail");
  const ticketQuery = useAdminTicket(id);

  if (ticketQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="w-8 h-8 text-rose-500" />
        <p className="text-sm">{tD("load_error")}</p>
        <Link
          href="/admin/tickets"
          className="text-xs text-primary hover:underline"
        >
          ← {tD("back_to_tickets")}
        </Link>
      </div>
    );
  }

  const ticket = ticketQuery.data;

  return (
    <div className="flex-1 flex min-h-0">
      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <header className="border-b border-border px-4 py-3 shrink-0">
          <Link
            href="/admin/tickets"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-3 h-3" />
            {tD("back_to_tickets")}
          </Link>

          <div className="flex items-start gap-3 min-w-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {ticket.subject}
              </h1>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <CategoryBadge category={ticket.category} />
                <span className="text-[11px] text-muted-foreground">
                  {timeAgo(ticket.created_at, t)}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-1">
              #{ticket.id.slice(0, 8)}
            </span>
          </div>
        </header>

        {/* Scrollable middle section */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Description block */}
          <section className="px-4 py-3 border-b border-border/60 bg-card/20">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              <span>{tD("from_label")}</span>
              <span className="text-foreground/80 normal-case tracking-normal text-xs">
                {ticket.filer?.name ?? ticket.filer?.email ?? tD("unknown_filer")}
              </span>
              {ticket.filer?.name && (
                <span className="text-muted-foreground normal-case tracking-normal text-[10px]">
                  · {ticket.filer.email}
                </span>
              )}
            </div>

            <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">
              {ticket.description}
            </div>

            {ticket.attachment_url && (
              <a
                href={ticket.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Paperclip className="w-3 h-3" />
                {tD("view_attachment")}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </section>

          {/* Triage panel */}
          <TriagePanel ticket={ticket} />

          {/* Timeline */}
          <TicketTimeline ticket={ticket} />
        </div>

        {/* Compose box */}
        <TicketReplyBox ticket={ticket} />
      </div>

      {/* Sidebar */}
      <TicketSidebar ticket={ticket} />
    </div>
  );
}
