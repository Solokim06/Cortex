"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MessageSquare, Copy, Check, ArrowUpRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SourceTypeChip } from "@/components/capture/SourceTypeChip";
import { VideoResult } from "@/components/memory/VideoResult";
import type { MemorySearchHit } from "@/lib/hooks/use-cortex";

type Props = {
  hit: MemorySearchHit;
  showScore?: boolean;
  highlighted?: boolean;
  onOpen: () => void;
};

type ScoreTranslator = (
  key: "scoreStrong" | "scoreGood" | "scoreWeak" | "scoreKeyword",
) => string;

function scoreLabel(
  score: number,
  t: ScoreTranslator,
): { label: string; tone: string } {
  if (score >= 0.75)
    return { label: t("scoreStrong"), tone: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 0.6)
    return { label: t("scoreGood"), tone: "text-sky-600 dark:text-sky-400" };
  if (score > 0) return { label: t("scoreWeak"), tone: "text-muted-foreground" };
  return { label: t("scoreKeyword"), tone: "text-muted-foreground" };
}

function ScoreRing({
  score,
  t,
}: {
  score: number;
  t: ScoreTranslator & ((key: "scoreTitle", values: { score: string }) => string);
}) {
  const pct = Math.max(0, Math.min(1, score));
  const size = 32;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const { label, tone } = scoreLabel(score, t);

  return (
    <div
      className="flex flex-col items-center gap-0.5 shrink-0"
      title={t("scoreTitle", { score: score.toFixed(2) })}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dasharray] duration-300"
        />
      </svg>
      <span className={cn("text-[9px] font-medium", tone)}>{label}</span>
    </div>
  );
}

export function ResultCard({
  hit,
  showScore = false,
  highlighted = false,
  onOpen,
}: Props) {
  const t = useTranslations("memory.result");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const hasVideo =
    typeof (hit.meta as Record<string, unknown> | undefined)?.video_url === "string" &&
    !!(hit.meta as Record<string, unknown>).video_url;

  const copyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hit.id);
      setCopied(true);
      toast.success(t("nodeIdCopied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const askCortex = (e: React.MouseEvent) => {
    e.stopPropagation();
    const q = hit.title
      ? t("askAboutTitle", { title: hit.title })
      : t("askAboutThis");
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group w-full text-left rounded-lg border bg-card/40 p-3.5 transition-colors cursor-pointer outline-none",
        highlighted
          ? "border-primary/60 bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-card/60",
      )}
    >
      {hasVideo && <VideoResult hit={hit} />}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <SourceTypeChip type={hit.type} />
            {hit.summary && (
              <span className="text-[10px] text-muted-foreground truncate">
                {hit.summary.slice(0, 100)}
              </span>
            )}
          </div>

          <p className="text-sm font-medium leading-snug truncate">
            {hit.title || t("untitled")}
          </p>

          {hit.content && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {hit.content}
            </p>
          )}

          <div className="flex items-center gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {hit.type === "concept" && (
              <Link
                href={`/memory/topics/${hit.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 text-primary px-2 py-1 text-[10px] hover:bg-primary/10 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                {t("topicSynthesis")}
              </Link>
            )}
            <button
              type="button"
              onClick={askCortex}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              {t("askCortex")}
            </button>
            <button
              type="button"
              onClick={copyId}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {copied ? t("copied") : t("copyId")}
            </button>
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              {t("open")}
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {showScore && <ScoreRing score={hit.score} t={t} />}
      </div>
    </div>
  );
}
