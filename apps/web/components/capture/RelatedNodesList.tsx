"use client";

import { useTranslations } from "next-intl";
import { useRelatedNodes, type RelatedNode } from "@/lib/hooks/use-cortex";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceTypeChip } from "./SourceTypeChip";
import { ArrowUpRight, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  nodeId: string;
  limit?: number;
  onOpen?: (nodeId: string) => void;
  className?: string;
};

export function RelatedNodesList({
  nodeId,
  limit = 5,
  onOpen,
  className,
}: Props) {
  const t = useTranslations("capture.related");
  const { data, isLoading, error } = useRelatedNodes(nodeId);

  if (isLoading) {
    return (
      <div className={cn("space-y-1.5", className)}>
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("loadFailed")}
      </p>
    );
  }

  const related = (data?.related ?? []).slice(0, limit);

  if (related.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {related.map((r) => (
        <RelatedRow
          key={r.id}
          node={r}
          onOpen={onOpen}
          untitledLabel={t("untitled")}
        />
      ))}
    </div>
  );
}

function RelatedRow({
  node,
  onOpen,
  untitledLabel,
}: {
  node: RelatedNode;
  onOpen?: (nodeId: string) => void;
  untitledLabel: string;
}) {
  const interactive = typeof onOpen === "function";
  const Wrapper = interactive ? "button" : "div";

  return (
    <Wrapper
      type={interactive ? "button" : undefined}
      onClick={interactive ? () => onOpen?.(node.id) : undefined}
      className={cn(
        "group w-full flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
        interactive && "hover:border-border hover:bg-accent/30",
      )}
    >
      <SourceTypeChip type={node.type} iconOnly />
      <span className="min-w-0 flex-1 text-sm truncate">
        {node.title || untitledLabel}
      </span>
      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
        <Link2 className="w-3 h-3" />
        {node.edge_type}
        {node.edge_direction === "incoming" && " ←"}
      </span>
      {interactive && (
        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      )}
    </Wrapper>
  );
}
