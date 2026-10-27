"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  GitMerge,
  Loader2,
  Link2,
  ListChecks,
  RotateCcw,
  Sparkles,
  X,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentAction } from "@/lib/hooks/use-agent-actions";
import {
  useApplyAgentAction,
  useRejectAgentAction,
  useUndoAgentAction,
} from "@/lib/hooks/use-agent-actions";
import { ProposalDetail } from "./ProposalDetail";

// =====================================================================
// helpers
// =====================================================================

const ICON_FOR_KIND: Record<string, LucideIcon> = {
  find_orphans: ListChecks,
  suggest_links: Link2,
  merge_concepts: GitMerge,
  place_url: Sparkles,
};

function statusColor(status: string) {
  switch (status) {
    case "applied":
      return "border-emerald-500/40 bg-emerald-500/5";
    case "rejected":
      return "border-border bg-card/30";
    case "undone":
      return "border-border bg-card/30";
    case "failed":
      return "border-rose-500/40 bg-rose-500/5";
    case "pending":
    default:
      return "border-primary/30 bg-primary/5";
  }
}

// =====================================================================
// component
// =====================================================================

type Props = {
  action: AgentAction;
  /** Called when the user clicks Apply (and the parent wants to know). */
  onApplied?: () => void;
  /** Compact mode hides the reasoning paragraph. Used inline in chat. */
  compact?: boolean;
};

export function ProposalCard({ action, onApplied, compact = false }: Props) {
  const t = useTranslations("agent.proposal");
  const [expanded, setExpanded] = useState(false);

  const apply = useApplyAgentAction();
  const reject = useRejectAgentAction();
  const undo = useUndoAgentAction();

  const proposal = action.proposal;
  const Icon = ICON_FOR_KIND[action.action_kind] ?? Sparkles;
  const nChanges = proposal?.changes?.length ?? 0;
  const busy =
    apply.isPending || reject.isPending || undo.isPending;

  const handleApply = async () => {
    try {
      await apply.mutateAsync(action.id);
      onApplied?.();
    } catch {
      // Errors are handled by React Query's error state; a toast would
      // be nice but we'll leave that to the parent if needed.
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border",
        statusColor(action.status),
        "overflow-hidden transition-colors",
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-3.5 py-2.5">
        <div className="shrink-0 rounded-md p-1.5 bg-background/60">
          <Icon className="w-3.5 h-3.5 text-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="text-sm font-medium truncate">
              {t(`title.${action.action_kind}`)}
            </div>
            <StatusPill status={action.status} />
          </div>

          {!compact && proposal?.reasoning && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {proposal.reasoning}
            </p>
          )}

          {nChanges > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {t("changeCount", { n: nChanges })}
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border/60 px-3.5 py-3 bg-background/30">
          <ProposalDetail action={action} />
        </div>
      )}

      {/* Action buttons */}
      {action.status === "pending" && (
        <div className="border-t border-border/60 px-3.5 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none transition-colors",
            )}
          >
            {apply.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {t("apply")}
          </button>
          <button
            type="button"
            onClick={() => reject.mutate(action.id)}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
              "border border-border bg-background hover:bg-accent/50",
              "disabled:opacity-40 disabled:pointer-events-none transition-colors",
            )}
          >
            {reject.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <X className="w-3 h-3" />
            )}
            {t("dismiss")}
          </button>
        </div>
      )}

      {action.status === "applied" && (
        <div className="border-t border-border/60 px-3.5 py-2 flex items-center gap-2">
          <span className="text-[11px] text-emerald-500">
            {t("appliedNote")}
          </span>
          <button
            type="button"
            onClick={() => undo.mutate(action.id)}
            disabled={busy}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px]",
              "border border-border bg-background hover:bg-accent/50",
              "disabled:opacity-40 disabled:pointer-events-none transition-colors",
            )}
          >
            {undo.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            {t("undo")}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// status pill
// =====================================================================

function StatusPill({ status }: { status: string }) {
  const t = useTranslations("agent.status");
  const cls =
    status === "applied"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : status === "pending"
        ? "border-primary/40 bg-primary/10 text-primary"
        : status === "rejected"
          ? "border-border bg-background text-muted-foreground"
          : status === "failed"
            ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
            : "border-border bg-background text-muted-foreground";
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
        cls,
      )}
    >
      {t(status)}
    </span>
  );
}
