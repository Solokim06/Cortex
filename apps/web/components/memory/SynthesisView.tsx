"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Sparkles, AlertCircle, HelpCircle, Link2 } from "lucide-react";
import Link from "next/link";
import { CitationText } from "./CitationText";
import type { TopicSynthesis, SynthesisPattern } from "@/lib/hooks/use-topics";

export function SynthesisView({ data }: { data: TopicSynthesis }) {
  const t = useTranslations("memory.synthesis");

  return (
    <div className="space-y-6">
      {/* Headline */}
      {data.headline && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium leading-snug">{data.headline}</p>
        </div>
      )}

      {/* What you've said */}
      {data.what_youve_said && (
        <section>
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {t("whatYouveSaid")}
          </h2>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            <CitationText text={data.what_youve_said} />
          </div>
        </section>
      )}

      {/* Patterns */}
      {data.patterns.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            <Sparkles className="w-2.5 h-2.5 text-primary" />
            {t("patterns")}
          </h2>
          <ul className="space-y-2">
            {data.patterns.map((p, i) => (
              <PatternRow key={i} pattern={p} />
            ))}
          </ul>
        </section>
      )}

      {/* Tensions — visually distinct */}
      {data.tensions.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-500 mb-2">
            <AlertCircle className="w-2.5 h-2.5" />
            {t("tensions")}
          </h2>
          <ul className="space-y-2">
            {data.tensions.map((p, i) => (
              <PatternRow key={i} pattern={p} tone="amber" />
            ))}
          </ul>
        </section>
      )}

      {/* Open questions */}
      {data.open_questions.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            <HelpCircle className="w-2.5 h-2.5" />
            {t("openQuestions")}
          </h2>
          <ul className="space-y-1.5">
            {data.open_questions.map((q, i) => (
              <li
                key={i}
                className="text-sm text-foreground/85 pl-3 border-l-2 border-border"
              >
                {q}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Related concepts */}
      {data.related_concepts.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            <Link2 className="w-2.5 h-2.5" />
            {t("relatedConcepts")}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {data.related_concepts.map((c, i) => (
              <span
                key={i}
                className="text-[11px] rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Sources */}
      {data.source_node_ids.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {t("sources", { count: data.source_node_ids.length })}
          </h2>
          <ol className="space-y-1.5">
            {data.source_node_ids.map((id, i) => (
              <li
                key={id}
                id={`source-${i}`}
                className="flex items-start gap-2 text-xs"
              >
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-muted/40 text-[10px] font-mono text-muted-foreground">
                  {i}
                </span>
                <Link
                  href={`/memory?q=${encodeURIComponent(id)}`}
                  className="text-muted-foreground hover:text-foreground truncate font-mono text-[10px] pt-1"
                >
                  {id}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function PatternRow({
  pattern,
  tone = "default",
}: {
  pattern: SynthesisPattern;
  tone?: "default" | "amber";
}) {
  const border =
    tone === "amber"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-border bg-card/40";
  return (
    <li className={cn("rounded-md border px-3 py-2", border)}>
      {pattern.label && (
        <p className="text-xs font-medium mb-0.5">{pattern.label}</p>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed">
        <CitationText text={pattern.detail} />
      </p>
    </li>
  );
}
