"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Wand2,
  Check,
  CheckCircle2,
  Clock,
  Info,
  Flag,
  Send,
  Trash2,
  Tag as TagIcon,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  useTriageTicket,
  useUpdateTicketPriority,
  useUpdateTicketStatus,
  usePostTeamReply,
  useApproveDraft,
  useDiscardDraft,
} from "@/lib/hooks/use-admin-tickets";
import type {
  TicketDetail,
  TriageResult,
  AiDraftReply,
  AiTriagePipeline,
} from "@/lib/admin-api";

type Props = {
  ticket: TicketDetail;
};

/**
 * Collapsible AI triage card.
 *
 * State machine:
 *   - collapsed (default) — shows header with a "Analyze" button
 *   - analyzing — spinner while the LLM call runs
 *   - result — shows category / priority / rationale / draft reply
 *              with action buttons to apply each suggestion
 *
 * The result is cached server-side for 24h in ticket.context.ai_triage,
 * so re-opening the panel doesn't burn tokens. "Re-analyze" forces a
 * fresh call.
 */
export function TriagePanel({ ticket }: Props) {
  const t = useTranslations("admin.tickets.triage");
  // Server-side cached suggestion — comes with the ticket payload
  const cachedTriage = readCachedTriage(ticket);

  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(cachedTriage);

  const triageMutation = useTriageTicket(ticket.id);

  const analyze = async (force: boolean) => {
    try {
      const res = await triageMutation.mutateAsync({ force });
      setResult(res);
      setExpanded(true);
      toast.success(res.cached ? t("toast_cached") : t("toast_complete"));
    } catch {
      toast.error(t("toast_failed"));
    }
  };

  const analyzing = triageMutation.isPending;

  // ----------------------------------------------------------------
  // Collapsed header
  // ----------------------------------------------------------------
  return (
    <section className="border-b border-border/60 bg-card/10">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-accent/10 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">{t("header_title")}</span>
        {result && !expanded && (
          <span className="text-[10px] text-muted-foreground">
            · {result.category} · {result.priority}
            {result.cached && ` · ${t("cached_suffix")}`}
          </span>
        )}
        {!result && (() => {
          const p = readPipeline(ticket);
          if (!p) return null;
          if (p.auto_sent) {
            return (
              <span className="text-[10px] text-emerald-500 inline-flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {t("auto_replied")}
              </span>
            );
          }
          if (readDraft(ticket)) {
            return (
              <span className="text-[10px] text-primary inline-flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {t("draft_ready")}
              </span>
            );
          }
          return null;
        })()}
        <div className="ml-auto flex items-center gap-2">
          {!result && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                void analyze(false);
              }}
              role="button"
              tabIndex={0}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]",
                "border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors",
                analyzing && "opacity-50 pointer-events-none",
              )}
            >
              {analyzing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 text-primary" />
              )}
              {analyzing ? t("analyzing") : t("analyze")}
            </span>
          )}
          {result && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                void analyze(true);
              }}
              role="button"
              tabIndex={0}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]",
                "border border-border hover:bg-accent/50 transition-colors",
                analyzing && "opacity-50 pointer-events-none",
              )}
            >
              <RefreshCw
                className={cn("w-3 h-3", analyzing && "animate-spin")}
              />
              {t("reanalyze")}
            </span>
          )}
        </div>
      </button>

      {/* ---------------------------------------------------------------- */}
      {/* Expanded body                                                     */}
      {/* ---------------------------------------------------------------- */}
      {expanded && (
        <div className="px-4 pb-4">
          {analyzing && !result && (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("loading_analyzing")}
            </div>
          )}

          {!analyzing && !result && (
            <div className="text-xs text-muted-foreground py-4">
              {t("empty_hint_before")}
              <strong className="text-foreground">{t("empty_hint_bold")}</strong>
              {t("empty_hint_after")}
            </div>
          )}

          {result && (
            <TriageBody
              ticket={ticket}
              result={result}
              pipeline={readPipeline(ticket)}
              draft={readDraft(ticket)}
              onApplied={() => {
                // Doesn't reset the result — admin might want to apply more
                // suggestions afterwards.
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}

// =====================================================================
// body — the suggestion content
// =====================================================================

function TriageBody({
  ticket,
  result,
  pipeline,
  draft,
}: {
  ticket: TicketDetail;
  result: TriageResult;
  pipeline: AiTriagePipeline | null;
  draft: AiDraftReply | null;
  onApplied: () => void;
}) {
  const t = useTranslations("admin.tickets.triage");
  const statusMutation = useUpdateTicketStatus(ticket.id);
  const priorityMutation = useUpdateTicketPriority(ticket.id);
  const replyMutation = usePostTeamReply(ticket.id);
  const approveMutation = useApproveDraft(ticket.id);
  const discardMutation = useDiscardDraft(ticket.id);

  const aiAutoSent = !!pipeline?.auto_sent;

  const handleApprove = () => {
    approveMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.ok) {
          toast.success(t("toast_ai_sent"));
        } else {
          toast.error(
            t("toast_send_failed_reason", { reason: res.reason ?? "unknown" }),
          );
        }
      },
      onError: () => toast.error(t("toast_send_failed")),
    });
  };

  const handleDiscard = () => {
    discardMutation.mutate(undefined, {
      onSuccess: () => toast.success(t("toast_draft_discarded")),
      onError: () => toast.error(t("toast_discard_failed")),
    });
  };

  const categoryMatches = result.category === ticket.category;
  const priorityMatches = result.priority === ticket.priority;

  const confidencePercent = Math.round(result.confidence * 100);
  const confidenceTone =
    result.confidence >= 0.75
      ? "text-emerald-500"
      : result.confidence >= 0.5
        ? "text-amber-500"
        : "text-rose-500";

  const applyCategoryHint = () => {
    // The category field can't be updated via a dedicated endpoint, so we
    // mention it in the UI but don't apply it directly. Admins can note it
    // in the reply or an internal note.
    toast.info(
      t("toast_category_hint", { category: result.category }),
    );
  };

  const applyPriority = () => {
    priorityMutation.mutate(result.priority, {
      onSuccess: () => toast.success(t("toast_priority_set", { priority: result.priority })),
    });
  };

  const applyStatus = () => {
    // Common triage flow: acknowledging a ticket means moving it to
    // in_progress. Only suggest that if it's currently open.
    if (ticket.status === "open") {
      statusMutation.mutate(
        { status: "in_progress", expectedUpdatedAt: ticket.updated_at },
        { onSuccess: () => toast.success(t("toast_status_in_progress")) },
      );
    }
  };

  const useDraftReply = () => {
    // Copy the draft into the clipboard so the admin can paste into the
    // reply box (avoids needing a ref into the compose component).
    void navigator.clipboard.writeText(result.draft_reply);
    toast.success(t("toast_draft_copied"));
    replyMutation.reset();
  };

  return (
    <div className="space-y-3">
      {/* Meta row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {new Date(result.generated_at).toLocaleString()}
        </span>
        <span className={cn("inline-flex items-center gap-1", confidenceTone)}>
          <Info className="w-2.5 h-2.5" />
          {t("meta_confidence", { pct: confidencePercent })}
        </span>
        <span className="font-mono opacity-60">{result.model}</span>
        {result.cached && (
          <span className="rounded-full border border-border px-1.5 py-0.5">
            {t("meta_cached_badge")}
          </span>
        )}
      </div>

      {/* Suggestion grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <SuggestionCard
          icon={TagIcon}
          label={t("card_category")}
          value={result.category}
          matches={categoryMatches}
          onApply={applyCategoryHint}
        />
        <SuggestionCard
          icon={Flag}
          label={t("card_priority")}
          value={result.priority}
          matches={priorityMatches}
          onApply={applyPriority}
          applying={priorityMutation.isPending}
        />
      </div>

      {/* Rationale */}
      {result.rationale && (
        <div className="rounded-md border border-border bg-background/60 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            {t("rationale_label")}
          </div>
          <p className="text-xs whitespace-pre-wrap break-words text-foreground/85">
            {result.rationale}
          </p>
        </div>
      )}

      {/* AI pipeline status */}
      {pipeline && (
        <div
          className={cn(
            "rounded-md border p-2.5 flex items-center gap-2.5",
            aiAutoSent
              ? "border-emerald-500/40 bg-emerald-500/5"
              : pipeline.error
                ? "border-rose-500/40 bg-rose-500/5"
                : "border-border bg-background/60",
          )}
        >
          {aiAutoSent ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : pipeline.error ? (
            <Info className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">
              {aiAutoSent
                ? t("pipeline_auto_replied")
                : pipeline.error
                  ? t("pipeline_error")
                  : t("pipeline_ran")}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {pipeline.processed_at
                ? new Date(pipeline.processed_at).toLocaleString()
                : t("pipeline_just_now")}
              {typeof pipeline.confidence === "number" && (
                <> · {t("pipeline_confidence", { pct: Math.round(pipeline.confidence * 100) })}</>
              )}
              {pipeline.applied_diff?.category_after &&
                pipeline.applied_diff.category_before !==
                  pipeline.applied_diff.category_after && (
                  <>
                    {" "}
                    · {t("pipeline_category_change", {
                      before: pipeline.applied_diff.category_before ?? "—",
                      after: pipeline.applied_diff.category_after,
                    })}
                  </>
                )}
            </p>
          </div>
        </div>
      )}

      {/* Pending AI draft — the primary action surface */}
      {draft && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary mb-2">
            <Sparkles className="w-2.5 h-2.5" />
            {t("draft_header")}
          </div>
          <p className="text-xs whitespace-pre-wrap break-words text-foreground/90 mb-3 leading-relaxed">
            {draft.content}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approveMutation.isPending || replyMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              {approveMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              {t("draft_approve")}
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              disabled={discardMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px]",
                "border border-border bg-background hover:bg-accent/50",
                "disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              {discardMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              {t("draft_discard")}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(draft.content);
                toast.success(t("toast_draft_copied_customize"));
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px]",
                "text-muted-foreground hover:text-foreground transition-colors",
              )}
            >
              <Wand2 className="w-3 h-3" />
              {t("draft_copy")}
            </button>
          </div>
        </div>
      )}

      {/* Fresh suggestion from the result — only when no pending draft */}
      {result.draft_reply && !draft && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary mb-1.5">
            <Sparkles className="w-2.5 h-2.5" />
            {t("suggestion_header")}
          </div>
          <p className="text-xs whitespace-pre-wrap break-words text-foreground/90 mb-2">
            {result.draft_reply}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={useDraftReply}
              disabled={replyMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              <Wand2 className="w-3 h-3" />
              {t("suggestion_copy")}
            </button>
            {ticket.status === "open" && (
              <button
                type="button"
                onClick={applyStatus}
                disabled={statusMutation.isPending}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]",
                  "border border-border bg-background hover:bg-accent/50",
                  "disabled:opacity-40 disabled:pointer-events-none",
                )}
              >
                {statusMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                {t("suggestion_mark_progress")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// suggestion card
// =====================================================================

function SuggestionCard({
  icon: Icon,
  label,
  value,
  matches,
  onApply,
  applying = false,
}: {
  icon: typeof TagIcon;
  label: string;
  value: string;
  matches: boolean;
  onApply: () => void;
  applying?: boolean;
}) {
  const t = useTranslations("admin.tickets.triage");
  return (
    <div
      className={cn(
        "rounded-md border p-2.5 flex items-center gap-2.5",
        matches
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border bg-background/60",
      )}
    >
      <Icon
        className={cn(
          "w-3.5 h-3.5 shrink-0",
          matches ? "text-emerald-500" : "text-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-xs font-medium capitalize">
          {value}
          {matches && (
            <span className="ml-1.5 text-[10px] text-emerald-500 font-normal">
              ✓ {t("card_current")}
            </span>
          )}
        </div>
      </div>
      {!matches && (
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px]",
            "border border-border hover:bg-accent/50",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {applying ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <Check className="w-2.5 h-2.5" />
          )}
          {t("card_apply")}
        </button>
      )}
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================

/**
 * Read the AI pipeline state from ticket.context.ai_triage_pipeline.
 */
function readPipeline(ticket: TicketDetail): AiTriagePipeline | null {
  const raw = ticket.context?.ai_triage_pipeline;
  if (!raw || typeof raw !== "object") return null;
  return raw as AiTriagePipeline;
}

/**
 * Read the pending AI draft from ticket.context.ai_draft_reply.
 */
function readDraft(ticket: TicketDetail): AiDraftReply | null {
  const raw = ticket.context?.ai_draft_reply;
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.content !== "string" || typeof d.confidence !== "number") {
    return null;
  }
  return {
    content: d.content,
    confidence: d.confidence,
    category: (d.category as AiDraftReply["category"]) ?? null,
    generated_at: typeof d.generated_at === "string" ? d.generated_at : "",
  };
}

/**
 * Read the cached triage from ticket.context.ai_triage if present.
 * Returns null if missing or malformed.
 */
function readCachedTriage(ticket: TicketDetail): TriageResult | null {
  const raw = ticket.context?.ai_triage;
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (
    typeof t.category === "string" &&
    typeof t.priority === "string" &&
    typeof t.rationale === "string" &&
    typeof t.draft_reply === "string" &&
    typeof t.confidence === "number" &&
    typeof t.generated_at === "string" &&
    typeof t.model === "string"
  ) {
    return {
      category: t.category as TriageResult["category"],
      priority: t.priority as TriageResult["priority"],
      rationale: t.rationale,
      draft_reply: t.draft_reply,
      confidence: t.confidence,
      generated_at: t.generated_at,
      model: t.model,
      cached: true,
    };
  }
  return null;
}
