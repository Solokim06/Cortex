"use client";

import { useTranslations } from "next-intl";
import {
  Ticket,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { cn } from "cn";
import { useMyTickets, type UserTicket } from "@/lib/hooks/use-help";

type Props = {
  onOpenTicket?: (id: string) => void;
};

export function YourTickets({ onOpenTicket }: Props) {
  const t = useTranslations("help.tickets");
  const ticketsQuery = useMyTickets();

  if (ticketsQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card/40">
        <Header count={null} label={t("title")} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-5 py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  const tickets = ticketsQuery.data ?? [];

  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40">
        <Header count={0} label={t("title")} />
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <div className="rounded-full bg-muted/40 p-3">
            <Inbox className="w-5 h-5 opacity-60" />
          </div>
          <p className="text-sm">{t("empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
      <Header count={tickets.length} label={t("title")} />
      <ul className="divide-y divide-border/60">
        {tickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            onClick={() => onOpenTicket?.(ticket.id)}
            labels={{
              status: t(`status_${ticket.status}` as never),
              category: t(`category_${ticket.category}` as never),
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function Header({ count, label }: { count: number | null; label: string }) {
  const t = useTranslations("help.tickets");
  return (
    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/60">
      <div className="rounded-md bg-primary/10 p-1.5">
        <Ticket className="w-3.5 h-3.5 text-primary" />
      </div>
      <h2 className="text-sm font-medium">{label}</h2>
      {count !== null && (
        <span className="text-xs text-muted-foreground ml-auto">
          {t("count", { count })}
        </span>
      )}
    </div>
  );
}

function TicketRow({
  ticket,
  onClick,
  labels,
}: {
  ticket: UserTicket;
  onClick?: () => void;
  labels: { status: string; category: string };
}) {
  const meta = STATUS_META[ticket.status];
  const Icon = meta.icon;

  return (
    <li
      id={`ticket-${ticket.id}`}
      className={cn(
        "group",
        onClick && "cursor-pointer hover:bg-accent/20 transition-colors",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="px-5 py-3.5 flex items-start gap-3">
        <div
          className={cn(
            "rounded-md border p-1.5 shrink-0 mt-0.5",
            meta.tone,
          )}
        >
          <Icon className="w-3 h-3" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-medium truncate group-hover:text-foreground">
              {ticket.subject}
            </p>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 shrink-0",
                meta.tone,
              )}
            >
              {labels.status}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{labels.category}</span>
            <span className="opacity-40">·</span>
            <span className="tabular-nums">{timeAgo(ticket.created_at)}</span>
          </div>
        </div>

        {onClick && (
          <ChevronRight
            className={cn(
              "w-4 h-4 text-muted-foreground/40 shrink-0 mt-1",
              "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
              "transition-opacity",
            )}
          />
        )}
      </div>
    </li>
  );
}

const STATUS_META: Record<
  UserTicket["status"],
  { icon: typeof AlertCircle; tone: string }
> = {
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
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
