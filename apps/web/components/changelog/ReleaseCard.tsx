"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { Release } from "@/lib/changelog";
import { releaseAnchor } from "@/lib/changelog";
import { ReleaseSection } from "./ReleaseSection";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ReleaseCard({ release }: { release: Release }) {
  const isLatest = release.tag === "Latest";

  return (
    <article
      id={releaseAnchor(release)}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card/40 overflow-hidden",
        isLatest ? "border-primary/40" : "border-border/60",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "px-5 sm:px-6 py-4 border-b border-border/50",
          isLatest
            ? "bg-gradient-to-br from-primary/8 via-card/40 to-card/30"
            : "bg-card/30",
        )}
      >
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <span className="font-mono text-[13px] font-medium text-foreground">
            {release.version}
          </span>

          {release.tag && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                isLatest
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-card/60 text-muted-foreground",
              )}
            >
              {isLatest && <Sparkles className="w-2.5 h-2.5" />}
              {release.tag}
            </span>
          )}

          <span className="text-[12px] text-muted-foreground">
            {formatDate(release.date)}
          </span>
        </div>

        <h3 className="text-base font-semibold tracking-tight mt-1">
          {release.title}
        </h3>
      </div>

      {/* Summary + stat chips */}
      <div className="px-5 sm:px-6 py-4 border-b border-border/40 space-y-3">
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {release.summary}
        </p>

        {release.stats && release.stats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {release.stats.map((s) => (
              <span
                key={s.label}
                className="inline-flex items-baseline gap-1.5 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground"
              >
                <span className="font-mono font-medium text-foreground/90 tabular-nums">
                  {s.count}
                </span>
                <span className="uppercase tracking-wider">{s.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="px-5 sm:px-6 py-2">
        {release.sections.map((section) => (
          <ReleaseSection key={section.title} section={section} />
        ))}
      </div>

      {/* What's next — only on latest */}
      {isLatest && release.whatsNext && release.whatsNext.length > 0 && (
        <div className="px-5 sm:px-6 py-5 border-t border-border/40 bg-primary/[0.03]">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-3.5 h-3.5 text-primary/80 shrink-0" />
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-primary/80">
              On the roadmap
            </h4>
          </div>
          <ul className="space-y-1.5 ml-[22px]">
            {release.whatsNext.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px] text-muted-foreground leading-relaxed"
              >
                <span className="inline-block w-1 h-1 rounded-full bg-primary/60 mt-[9px] shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/features"
            className="mt-4 ml-[22px] inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline"
          >
            See everything Cortex does
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </article>
  );
}
