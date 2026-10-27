"use client";

import { createElement } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Lightbulb,
  BarChart3,
  Sparkles,
  User as UserIcon,
  ArrowUpRight,
  GitBranch,
} from "lucide-react";
import type { Reflection } from "@/lib/hooks/use-cortex";
import { kindTone } from "@/lib/hooks/use-reflections";

type Props = {
  reflection: Reflection;
  highlighted?: boolean;
  onOpen: () => void;
};

type IconComponent = React.ComponentType<{ className?: string }>;

const KIND_ICONS: Record<string, IconComponent> = {
  lesson: Lightbulb,
  weekly_report: BarChart3,
  pattern_insight: Sparkles,
  identity_update: UserIcon,
};

const DEFAULT_ICON: IconComponent = Lightbulb;

function KindIcon({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  const Icon = KIND_ICONS[kind] ?? DEFAULT_ICON;
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

export function ReflectionCard({
  reflection,
  highlighted = false,
  onOpen,
}: Props) {
  const t = useTranslations("reflections.card");
  const tone = kindTone(reflection.kind);
  const excerpt =
    reflection.content.length > 220
      ? reflection.content.slice(0, 220).trimEnd() + "…"
      : reflection.content;

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
        "group w-full text-left rounded-lg border bg-card/40 p-4 transition-colors cursor-pointer outline-none",
        highlighted
          ? "border-primary/60 bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-card/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-1.5 shrink-0 mt-0.5">
          <KindIcon
            kind={reflection.kind}
            className="w-3.5 h-3.5 text-primary"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                tone,
              )}
            >
              <KindIcon kind={reflection.kind} className="w-2.5 h-2.5" />
              {kindLabel(reflection.kind, t)}
            </span>
            {reflection.decision_id && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <GitBranch className="w-2.5 h-2.5" />
                {t("linkedToDecision")}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {timeAgo(reflection.created_at, t)}
            </span>
          </div>

          {reflection.title && (
            <p className="text-sm font-medium leading-snug mb-1.5 line-clamp-1">
              {reflection.title}
            </p>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {excerpt}
          </p>

          <div className="flex items-center justify-end mt-2">
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              {t("open")}
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
