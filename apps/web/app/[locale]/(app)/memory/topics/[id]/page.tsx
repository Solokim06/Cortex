"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  RefreshCw,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SynthesisView } from "@/components/memory/SynthesisView";
import {
  useTopicSynthesis,
  useRegenerateSynthesis,
} from "@/lib/hooks/use-topics";

export default function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("memory.synthesis");

  const { data, isLoading, isError, error } = useTopicSynthesis(id);
  const regenerate = useRegenerateSynthesis(id);
  const [hasRequested, setHasRequested] = useState(false);

  const isEmpty = !isLoading && !isError && !!data && !data.headline;

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 md:px-6 pt-4 pb-4 border-b border-border/60">
          <div className="max-w-3xl mx-auto">
            <Link
              href="/memory/topics"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="w-3 h-3" />
              {t("backToTopics")}
            </Link>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight truncate">
                  {data?.concept_title || t("loadingTitle")}
                </h1>
                {data?.generated_at && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {t("generatedAt", {
                      when: new Date(data.generated_at).toLocaleString(),
                    })}
                  </p>
                )}
              </div>

              {data?.headline && (
                <button
                  type="button"
                  onClick={() => regenerate.mutate()}
                  disabled={regenerate.isPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs shrink-0",
                    "border border-border bg-background hover:bg-accent/50 transition-colors",
                    "disabled:opacity-40 disabled:pointer-events-none",
                  )}
                >
                  {regenerate.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {regenerate.isPending ? t("regenerating") : t("regenerate")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-12">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("loading")}
              </div>
            )}

            {isError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-xs text-rose-500">
                {error instanceof Error ? error.message : t("loadFailed")}
              </div>
            )}

            {/* Empty — synthesis not yet generated */}
            {isEmpty && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Sparkles className="w-8 h-8 text-primary/40" />
                <p className="text-sm font-medium">{t("emptyTitle")}</p>
                <p className="text-xs text-muted-foreground max-w-md">
                  {t("emptyHint")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHasRequested(true);
                    regenerate.mutate();
                  }}
                  disabled={regenerate.isPending || hasRequested}
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "disabled:opacity-40 disabled:pointer-events-none",
                  )}
                >
                  {regenerate.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {regenerate.isPending ? t("generating") : t("generate")}
                </button>
                <p className="text-[10px] text-muted-foreground">
                  {t("generateEstimate")}
                </p>
              </div>
            )}

            {/* The synthesis */}
            {data && data.headline && <SynthesisView data={data} />}
          </div>
        </div>
      </div>
    </div>
  );
}
