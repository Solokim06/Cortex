import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { RELEASES } from "@/lib/changelog";
import { ReleaseCard } from "@/components/changelog/ReleaseCard";
import { ChangelogToc } from "@/components/changelog/Toc";

export const metadata: Metadata = {
  title: "Changelog — Cortex",
  description:
    "Every release of Cortex, from initial launch to the current build.",
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-20">
      {/* Hero */}
      <header className="max-w-3xl mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 pl-2 pr-3 py-1 mb-6">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Changelog
          </span>
        </div>

        <h1 className="text-[2rem] leading-[1.05] sm:text-5xl font-semibold tracking-tight sm:leading-[1]">
          What&apos;s changed.
        </h1>

        <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-2xl">
          Every release, every feature — in reverse chronological order.
          Cortex is built in public, and this page is the record.
        </p>
      </header>

      {/* Two-column: sticky TOC + release cards */}
      <div className="flex gap-10">
        <ChangelogToc releases={RELEASES} />

        <div className="min-w-0 flex-1 max-w-3xl space-y-6">
          {RELEASES.map((r) => (
            <ReleaseCard key={r.version} release={r} />
          ))}
        </div>
      </div>

      {/* Closing */}
      <div className="max-w-3xl mt-14 pt-8 border-t border-border/60">
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
          Cortex is built by one developer in public. Every change here is
          real, shipped, and verified.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/features"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/40 px-3.5 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            See what Cortex does
            <ArrowRight className="w-3 h-3" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/40 px-3.5 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Report an issue
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
