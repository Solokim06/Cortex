"use client";

import { createElement } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Lightbulb,
  BarChart3,
  Sparkles,
  User as UserIcon,
  MessageSquare,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useReflectionDetail, kindTone } from "@/lib/hooks/use-reflections";

type Props = {
  reflectionId: string;
  onBack: () => void;
};

type IconComponent = React.ComponentType<{ className?: string }>;

const KIND_ICONS: Record<string, IconComponent> = {
  lesson: Lightbulb,
  weekly_report: BarChart3,
  pattern_insight: Sparkles,
  identity_update: UserIcon,
};

function KindIcon({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  const Icon = KIND_ICONS[kind] ?? Lightbulb;
  return createElement(Icon, { className });
}

type KindTranslator = (
  key: "kindLesson" | "kindReport" | "kindPattern" | "kindIdentity",
) => string;

function kindLabel(kind: string, t: KindTranslator): string {
  if (kind === "lesson") return t("kindLesson");
  if (kind === "weekly_report") return t("kindReport");
  if (kind === "pattern_insight") return t("kindPattern");
  if (kind === "identity_update") return t("kindIdentity");
  return kind;
}

export function ReflectionDetail({ reflectionId, onBack }: Props) {
  const t = useTranslations("reflections.detail");
  const { data, isLoading, isError, error } = useReflectionDetail(reflectionId);
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-4">
        <div className="h-4 w-24 bg-accent/30 rounded animate-pulse" />
        <div className="h-8 w-3/4 bg-accent/40 rounded animate-pulse" />
        <div className="space-y-3 pt-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-accent/20 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("backToReflections")}
        </button>
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error instanceof Error ? error.message : t("loadFailed")}
        </div>
      </div>
    );
  }

  const tone = kindTone(data.kind);
  const why =
    typeof data.meta?.why_it_matters === "string"
      ? data.meta.why_it_matters
      : "";
  const tags = Array.isArray(data.meta?.tags) ? (data.meta.tags as string[]) : [];
  const themes = Array.isArray(data.meta?.themes)
    ? (data.meta.themes as string[])
    : [];
  const strengths = Array.isArray(data.meta?.strengths)
    ? (data.meta.strengths as string[])
    : [];
  const blindSpots = Array.isArray(data.meta?.blind_spots)
    ? (data.meta.blind_spots as string[])
    : [];
  const growth = Array.isArray(data.meta?.growth_observations)
    ? (data.meta.growth_observations as string[])
    : [];
  const questions = Array.isArray(data.meta?.questions_to_sit_with)
    ? (data.meta.questions_to_sit_with as string[])
    : [];
  const sourceQuestion =
    typeof data.meta?.source_question === "string"
      ? data.meta.source_question
      : "";

  const askCortex = () => {
    const q = data.title
      ? t("askAboutTitle", { title: data.title })
      : t("askAboutGeneric");
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      <button
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        {t("backToReflections")}
      </button>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 shrink-0 mt-0.5">
          <KindIcon kind={data.kind} className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.title || kindLabel(data.kind, t)}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] gap-1", tone)}>
              <KindIcon kind={data.kind} className="w-2.5 h-2.5" />
              {kindLabel(data.kind, t)}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {new Date(data.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {data.content}
        </p>
        {why && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("whyItMatters")}
            </p>
            <p className="text-xs leading-relaxed text-foreground/90">
              {why}
            </p>
          </div>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-full border border-border bg-accent/20 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Source decision */}
      {sourceQuestion && (
        <>
          <Separator />
          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <GitBranch className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-medium text-muted-foreground">
                {t("sourceDecision")}
              </p>
            </div>
            <p className="text-sm leading-relaxed">{sourceQuestion}</p>
            {data.decision_id && (
              <button
                onClick={() =>
                  router.push(`/decisions?decision=${data.decision_id}`)
                }
                className="mt-2 text-[11px] text-primary hover:underline"
              >
                {t("openInDecisions")}
              </button>
            )}
          </div>
        </>
      )}

      {/* Report-specific sections */}
      {(themes.length > 0 ||
        strengths.length > 0 ||
        blindSpots.length > 0 ||
        growth.length > 0 ||
        questions.length > 0) && (
        <>
          <Separator />
          <div className="space-y-4">
            <ReportSection title={t("themesHeading")} items={themes} tone="primary" />
            <ReportSection
              title={t("strengthsHeading")}
              items={strengths}
              tone="emerald"
            />
            <ReportSection
              title={t("blindSpotsHeading")}
              items={blindSpots}
              tone="amber"
            />
            <ReportSection
              title={t("growthHeading")}
              items={growth}
              tone="sky"
            />
            <ReportSection
              title={t("questionsHeading")}
              items={questions}
              tone="violet"
            />
          </div>
        </>
      )}

      {/* Footer */}
      <Separator />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={askCortex}>
          <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
          {t("askCortex")}
        </Button>
      </div>
    </div>
  );
}

function ReportSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "primary" | "emerald" | "amber" | "sky" | "violet";
}) {
  if (items.length === 0) return null;
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "sky"
          ? "text-sky-600 dark:text-sky-400"
          : tone === "violet"
            ? "text-violet-600 dark:text-violet-400"
            : "text-primary";
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="text-xs leading-relaxed flex items-start gap-1.5"
          >
            <span className={cn("shrink-0 mt-0.5", toneClass)}>&middot;</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
