"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ExternalLink, Plus, GitMerge, Info } from "lucide-react";
import type { AgentAction, ProposalChange } from "@/lib/hooks/use-agent-actions";

type Props = {
  action: AgentAction;
};

export function ProposalDetail({ action }: Props) {
  const t = useTranslations("agent.detail");
  const changes = action.proposal?.changes ?? [];
  const details = action.proposal?.details ?? [];

  if (changes.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        {t("noChanges")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {changes.map((c, i) => (
        <ChangeRow key={i} change={c} note={details[i]?.note} />
      ))}
    </div>
  );
}

// =====================================================================
// individual change renderer
// =====================================================================

function ChangeRow({
  change,
  note,
}: {
  change: ProposalChange;
  note?: string;
}) {
  const t = useTranslations("agent.detail.ops");

  switch (change.op) {
    case "inform_orphan": {
      const node = (change.node as
        | { id: string; title: string; summary?: string }
        | undefined) ?? { id: "", title: "" };
      return (
        <div className="flex items-start gap-2 text-[11px]">
          <Info className="w-3 h-3 mt-0.5 text-amber-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate">
              <span className="font-medium">{node.title}</span>
              {node.summary && (
                <span className="text-muted-foreground"> --- {node.summary}</span>
              )}
            </div>
            <Link
              href={`/memory?q=${encodeURIComponent(node.id)}`}
              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5"
            >
              {t("openInMemory")}
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
        </div>
      );
    }

    case "create_edge": {
      // Prefer human-readable titles from the change dict when present;
      // fall back to raw UUIDs.
      const from = String(change.from_title ?? change.from ?? "");
      const to = String(change.to_title ?? change.to ?? "");
      const type = String(change.type ?? "related_to");
      return (
        <div className="flex items-start gap-2 text-[11px]">
          <Plus className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate">
              {t("createEdge", { from, to, type })}
            </div>
            {note && (
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {note}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "merge_nodes": {
      // Prefer titles when the agent provides them; fall back to UUIDs.
      const alias = String(change.alias_title ?? change.alias_id ?? "");
      const canonical = String(change.canonical_title ?? change.canonical_id ?? "");
      return (
        <div className="flex items-start gap-2 text-[11px]">
          <GitMerge className="w-3 h-3 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate">
              {t("mergeNodes", { alias, canonical })}
            </div>
            {note && (
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {note}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "create_node": {
      const title = String(change.title ?? "");
      const type = String(change.type ?? "node");
      return (
        <div className="flex items-start gap-2 text-[11px]">
          <Plus className="w-3 h-3 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate">
              {t("createNode", { title, type })}
            </div>
          </div>
        </div>
      );
    }

    case "update_node": {
      const patch = (change.patch as Record<string, unknown>) ?? {};
      const fields = Object.keys(patch).join(", ");
      return (
        <div className="flex items-start gap-2 text-[11px]">
          <Info className="w-3 h-3 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate">
              {t("updateNode", { fields })}
            </div>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="text-[11px] text-muted-foreground italic">
          {change.op}
        </div>
      );
  }
}
