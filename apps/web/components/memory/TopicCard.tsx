"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BookOpen, Clock, Sparkles, ChevronRight } from "lucide-react";
import type { TopicListItem } from "@/lib/hooks/use-topics";

export function TopicCard({ topic }: { topic: TopicListItem }) {
  const t = useTranslations("memory.topics");

  const generated = topic.generated_at
    ? new Date(topic.generated_at).toLocaleDateString()
    : null;

  return (
    <Link
      href={`/memory/topics/${topic.id}`}
      className={cn(
        "group block rounded-lg border bg-card/40 p-3.5 transition-colors",
        "border-border hover:border-primary/40 hover:bg-card/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 rounded-md p-2 mt-0.5",
            topic.has_synthesis ? "bg-primary/10" : "bg-muted/40",
          )}
        >
          {topic.has_synthesis ? (
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          ) : (
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug truncate">
            {topic.title || t("untitled")}
          </p>

          {topic.headline ? (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {topic.headline}
            </p>
          ) : topic.summary ? (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {topic.summary}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic mt-1">
              {t("noSynthesisYet")}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
            {topic.has_synthesis ? (
              generated && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {t("generatedOn", { date: generated })}
                </span>
              )
            ) : (
              <span>{t("notGenerated")}</span>
            )}
            {topic.stale && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/5 text-amber-500 px-1.5 py-0.5">
                {t("staleBadge")}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground shrink-0 mt-1 transition-colors" />
      </div>
    </Link>
  );
}
