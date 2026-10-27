"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import {
  Tag as TagIcon,
  X,
  Clock,
  Flame,
  CheckCircle2,
  Calendar,
  ExternalLink,
  FileText,
  Loader2,
  Hash,
} from "lucide-react";
import { cn } from "cn";
import {
  CategoryBadge,
  formatDuration,
} from "./TicketBadges";
import { AssigneePicker } from "./AssigneePicker";
import {
  useAddTicketTag,
  useAssignTicket,
  useRemoveTicketTag,
  useUpdateTicketPriority,
  useUpdateTicketStatus,
} from "@/lib/hooks/use-admin-tickets";
import type {
  TicketDetail,
  TicketPriority,
  TicketStatus,
} from "@/lib/admin-api";

type Props = {
  ticket: TicketDetail;
};

/**
 * Right-side panel on the ticket detail page.
 *
 * Sections:
 *   - Properties (status, priority, assignee)
 *   - Tags (chips + add input)
 *   - SLA (first response + resolution timers)
 *   - Metadata (id, category, created, updated)
 *   - Context (route, app version, attachment)
 */
export function TicketSidebar({ ticket }: Props) {
  return (
    <aside className="w-full lg:w-80 shrink-0 border-l border-border bg-card/20 flex flex-col overflow-y-auto">
      <PropertiesSection ticket={ticket} />
      <TagsSection ticket={ticket} />
      <SlaSection ticket={ticket} />
      <MetadataSection ticket={ticket} />
      <ContextSection ticket={ticket} />
    </aside>
  );
}

// =====================================================================
// properties (status / priority / assignee)
// =====================================================================

function PropertiesSection({ ticket }: { ticket: TicketDetail }) {
  const tS = useTranslations("admin.tickets.sidebar");
  const statusMutation = useUpdateTicketStatus(ticket.id);
  const priorityMutation = useUpdateTicketPriority(ticket.id);
  const assignMutation = useAssignTicket(ticket.id);

  return (
    <Section title={tS("section_properties")}>
      {/* Status */}
      <Field label={tS("field_status")}>
        <select
          value={ticket.status}
          disabled={statusMutation.isPending}
          onChange={(e) =>
            statusMutation.mutate({
              status: e.target.value as TicketStatus,
              expectedUpdatedAt: ticket.updated_at,
            })
          }
          className={selectCls}
        >
          <option value="open">{tS("status_open")}</option>
          <option value="in_progress">{tS("status_in_progress")}</option>
          <option value="resolved">{tS("status_resolved")}</option>
          <option value="closed">{tS("status_closed")}</option>
        </select>
        {statusMutation.isPending && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </Field>

      {/* Priority */}
      <Field label={tS("field_priority")}>
        <select
          value={ticket.priority}
          disabled={priorityMutation.isPending}
          onChange={(e) =>
            priorityMutation.mutate(e.target.value as TicketPriority)
          }
          className={selectCls}
        >
          <option value="urgent">{tS("priority_urgent")}</option>
          <option value="high">{tS("priority_high")}</option>
          <option value="normal">{tS("priority_normal")}</option>
          <option value="low">{tS("priority_low")}</option>
        </select>
        {priorityMutation.isPending && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </Field>

      {/* Assignee */}
      <Field label={tS("field_assignee")} block>
        <AssigneePicker
          value={ticket.assignee}
          disabled={assignMutation.isPending}
          onChange={(userId) => assignMutation.mutate(userId)}
        />
        {assignMutation.isPending && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-1" />
        )}
      </Field>
    </Section>
  );
}

// =====================================================================
// tags
// =====================================================================

function TagsSection({ ticket }: { ticket: TicketDetail }) {
  const tS = useTranslations("admin.tickets.sidebar");
  const [draft, setDraft] = useState("");
  const addMutation = useAddTicketTag(ticket.id);
  const removeMutation = useRemoveTicketTag(ticket.id);

  const submit = () => {
    const clean = draft.trim().toLowerCase();
    if (!clean) return;
    addMutation.mutate(clean, {
      onSuccess: () => setDraft(""),
    });
  };

  return (
    <Section title={tS("section_tags")}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {ticket.tags.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            {tS("tags_empty")}
          </span>
        )}
        {ticket.tags.map((tag) => (
          <span
            key={tag}
            className="group inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
          >
            <TagIcon className="w-2.5 h-2.5 text-muted-foreground" />
            {tag}
            <button
              type="button"
              onClick={() => removeMutation.mutate(tag)}
              disabled={removeMutation.isPending}
              className="text-muted-foreground hover:text-rose-500 disabled:opacity-50"
              aria-label={tS("tags_remove_aria", { tag })}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={tS("tags_placeholder")}
          maxLength={64}
          className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || addMutation.isPending}
          className={cn(
            "rounded-md px-2 py-1 text-xs",
            "border border-border hover:bg-accent/50",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {addMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            tS("tags_add")
          )}
        </button>
      </div>
    </Section>
  );
}

// =====================================================================
// sla
// =====================================================================

function SlaSection({ ticket }: { ticket: TicketDetail }) {
  const tS = useTranslations("admin.tickets.sidebar");
  const { first_response, resolution } = ticket.sla;

  return (
    <Section title={tS("section_sla")}>
      <SlaRow
        label={tS("sla_first_response")}
        dueAt={first_response.due_at}
        doneAt={first_response.responded_at}
        breached={first_response.breached}
        secondsRemaining={first_response.seconds_remaining}
      />
      <SlaRow
        label={tS("sla_resolution")}
        dueAt={resolution.due_at}
        doneAt={resolution.resolved_at}
        breached={resolution.breached}
        secondsRemaining={resolution.seconds_remaining}
      />
    </Section>
  );
}

function SlaRow({
  label,
  dueAt,
  doneAt,
  breached,
  secondsRemaining,
}: {
  label: string;
  dueAt: string | null;
  doneAt: string | null;
  breached: boolean;
  secondsRemaining: number | null;
}) {
  const t = useTranslations("admin.tickets");
  const tS = useTranslations("admin.tickets.sidebar");
  const isDone = doneAt !== null;

  let statusText = "—";
  let tone = "text-muted-foreground";

  if (isDone) {
    // Was it met or breached?
    if (breached) {
      statusText = tS("sla_breached");
      tone = "text-rose-500";
    } else {
      statusText = tS("sla_met");
      tone = "text-emerald-500";
    }
  } else if (breached) {
    statusText = tS("sla_overdue_by", {
      duration: formatDuration(
        secondsRemaining !== null ? -secondsRemaining : 0,
        t,
      ),
    });
    tone = "text-rose-500";
  } else if (secondsRemaining !== null) {
    if (secondsRemaining < 3600) {
      statusText = tS("sla_due_in", {
        duration: formatDuration(secondsRemaining, t),
      });
      tone = "text-amber-500";
    } else {
      statusText = tS("sla_due_in", {
        duration: formatDuration(secondsRemaining, t),
      });
      tone = "text-muted-foreground";
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className={cn("tabular-nums flex items-center gap-1 justify-end", tone)}>
          {breached && !isDone && <Flame className="w-3 h-3" />}
          {isDone && !breached && <CheckCircle2 className="w-3 h-3" />}
          {statusText}
        </div>
        {dueAt && (
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {new Date(dueAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// metadata
// =====================================================================

function MetadataSection({ ticket }: { ticket: TicketDetail }) {
  const tS = useTranslations("admin.tickets.sidebar");
  return (
    <Section title={tS("section_metadata")}>
      <div className="space-y-2 text-xs">
        <MetaRow icon={Hash} label={tS("meta_id")} value={ticket.id.slice(0, 8)} />
        <MetaRow icon={Calendar} label={tS("meta_created")} value={new Date(ticket.created_at).toLocaleString()} />
        <MetaRow icon={Calendar} label={tS("meta_updated")} value={new Date(ticket.updated_at).toLocaleString()} />
        {ticket.first_responded_at && (
          <MetaRow
            icon={Clock}
            label={tS("meta_first_reply")}
            value={new Date(ticket.first_responded_at).toLocaleString()}
          />
        )}
        {ticket.resolved_at && (
          <MetaRow
            icon={CheckCircle2}
            label={tS("meta_resolved")}
            value={new Date(ticket.resolved_at).toLocaleString()}
          />
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-muted-foreground">{tS("meta_category")}</span>
          <CategoryBadge category={ticket.category} />
        </div>
      </div>
    </Section>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <Icon className="w-3 h-3" />
        {label}
      </span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  );
}

// =====================================================================
// context (route, app version, attachment)
// =====================================================================

function ContextSection({ ticket }: { ticket: TicketDetail }) {
  const tS = useTranslations("admin.tickets.sidebar");
  const ctx = ticket.context ?? {};
  const entries = Object.entries(ctx).filter(
    ([k]) => !k.startsWith("ai_triage"),
  );

  const hasAny = entries.length > 0 || ticket.attachment_url;

  return (
    <Section title={tS("section_context")}>
      {!hasAny && (
        <p className="text-xs text-muted-foreground italic">
          {tS("context_empty")}
        </p>
      )}

      {entries.length > 0 && (
        <div className="space-y-1.5 text-xs">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground shrink-0">{k}</span>
              <span className="text-right truncate max-w-[60%]">
                {typeof v === "string" ? v : JSON.stringify(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {ticket.attachment_url && (
        <a
          href={ticket.attachment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <FileText className="w-3 h-3" />
          {tS("context_view_attachment")}
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </Section>
  );
}

// =====================================================================
// small building blocks
// =====================================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60 px-4 py-3">
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  block = false,
}: {
  label: string;
  children: React.ReactNode;
  block?: boolean;
}) {
  if (block) {
    return (
      <div className="py-1.5">
        <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
        <div className="flex items-center gap-1.5">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

const selectCls = cn(
  "appearance-none px-2 py-1 text-xs rounded border border-border bg-background",
  "focus:outline-none focus:ring-1 focus:ring-ring",
  "disabled:opacity-50",
);
