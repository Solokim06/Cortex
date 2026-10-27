"use client";

import { useEffect, createElement } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  X,
  FileText,
  Brain,
  Lightbulb,
  GitBranch,
  Layers,
  ArrowRight,
  ExternalLink,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNodeDetail, useRelatedNodes } from "@/lib/hooks/use-cortex";
import { SourceImageBlock } from "@/components/memory/SourceImageBlock";
import { parseAnnotations } from "@/lib/annotations";

type Props = {
  nodeId: string | null;
  onClose: () => void;
};

type IconComponent = React.ComponentType<{ className?: string }>;

const ICONS: Record<string, IconComponent> = {
  thought: FileText,
  concept: Brain,
  reflection: Lightbulb,
  decision: GitBranch,
};

const DEFAULT_ICON: IconComponent = Layers;

function TypeIcon({
  type,
  className,
}: {
  type: string | null | undefined;
  className?: string;
}) {
  const key = (type ?? "").toLowerCase();
  const Icon = ICONS[key] ?? DEFAULT_ICON;
  return createElement(Icon, { className });
}

type TimeTranslator = (
  key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo",
  values?: Record<string, string | number>,
) => string;

function timeAgo(iso: string, t: TimeTranslator): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("justNow");
  if (diff < 3600) return t("minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("daysAgo", { count: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString();
}

export function SourcePanel({ nodeId, onClose }: Props) {
  const t = useTranslations("chat.sourcePanel");
  const detailQuery = useNodeDetail(nodeId);
  const relatedQuery = useRelatedNodes(nodeId);

  const detail = detailQuery.data;
  const related = relatedQuery.data?.related ?? [];

  useEffect(() => {
    if (!nodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodeId, onClose]);

  if (!nodeId) return null;

  return (
    <>
      <div
        className="md:hidden fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={cn(
          "shrink-0 border-l border-border bg-card/40 backdrop-blur-sm",
          "w-full md:w-[400px]",
          "fixed md:relative right-0 top-0 h-full md:h-auto",
          "z-50 md:z-0",
          "flex flex-col",
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
              <TypeIcon type={detail?.type} className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("sourceLabel")}
              </p>
              <p className="text-sm font-medium truncate">
                {detail?.title || t("loading")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("closeAria")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {detailQuery.isLoading ? (
            <PanelSkeleton />
          ) : !detail ? (
            <p className="text-xs text-muted-foreground">
              {t("couldNotLoad")}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                <span className="capitalize px-1.5 py-0.5 rounded-md border border-border bg-accent/30">
                  {detail.type}
                </span>
                <span className="text-muted-foreground">·</span>
                <span>
                  {t("createdAt", { time: timeAgo(detail.created_at, t) })}
                </span>
              </div>

              {/* Image preview + annotations (only for image captures) */}
              {(() => {
                const meta = (detail.meta ?? {}) as Record<string, unknown>;
                const imageUrl = meta.image_url as string | undefined;
                if (!imageUrl) return null;
                const w = (meta.width as number) ?? 0;
                const h = (meta.height as number) ?? 0;
                const anns = parseAnnotations(
                  JSON.stringify(meta.annotations ?? []),
                );
                return (
                  <SourceImageBlock
                    nodeId={detail.id}
                    imageUrl={imageUrl}
                    imageWidth={w}
                    imageHeight={h}
                    annotations={anns}
                    onSaved={() => {
                      // Refetch the node so the panel reflects the new annotations
                      detailQuery.refetch();
                    }}
                  />
                );
              })()}

              {detail.summary && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                    {t("summaryLabel")}
                  </p>
                  <p className="text-xs text-foreground/90 leading-relaxed">
                    {detail.summary}
                  </p>
                </div>
              )}

              {detail.content && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                    {t("contentLabel")}
                  </p>
                  <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap">
                    {detail.content}
                  </p>
                </div>
              )}

              {related.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                    {t("connectedLabel", { count: related.length })}
                  </p>
                  <div className="space-y-1.5">
                    {related.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start gap-2 rounded-md border border-border bg-accent/20 px-2.5 py-2 hover:bg-accent/40 transition-colors cursor-pointer"
                      >
                        <TypeIcon
                          type={r.type}
                          className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">
                            {r.title || t("untitled")}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {r.type}
                            </span>
                            <span className="text-muted-foreground/40 text-[10px]">
                              ·
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              {r.edge_direction === "outgoing" ? (
                                <>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                  {r.edge_type}
                                </>
                              ) : (
                                <>
                                  <LinkIcon className="w-2.5 h-2.5" />
                                  {r.edge_type}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {detail && (
          <div className="px-4 py-3 border-t border-border/60">
            <Link
              href="/memory"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              {t("openInMemory")}
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-3 bg-accent/30 rounded w-1/3 animate-pulse" />
      <div className="space-y-2">
        <div className="h-3 bg-accent/20 rounded w-full animate-pulse" />
        <div className="h-3 bg-accent/20 rounded w-full animate-pulse" />
        <div className="h-3 bg-accent/20 rounded w-2/3 animate-pulse" />
      </div>
      <div className="h-3 bg-accent/30 rounded w-1/4 animate-pulse" />
      <div className="space-y-2">
        <div className="h-3 bg-accent/20 rounded w-full animate-pulse" />
        <div className="h-3 bg-accent/20 rounded w-5/6 animate-pulse" />
        <div className="h-3 bg-accent/20 rounded w-3/4 animate-pulse" />
      </div>
    </div>
  );
}
