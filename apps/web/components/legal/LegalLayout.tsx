"use client";

import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { LegalToc, type LegalTocItem } from "./LegalToc";

export function LegalLayout({
  title,
  subtitle,
  version,
  lastUpdated,
  toc,
  children,
  seeAlso,
}: {
  title: string;
  subtitle?: string;
  version: string;
  lastUpdated: string;
  toc: LegalTocItem[];
  children: ReactNode;
  seeAlso?: { href: string; label: string }[];
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-20">
      {/* Hero */}
      <header className="max-w-3xl mb-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 pl-2 pr-3 py-1 mb-6">
          <FileText className="w-3 h-3 text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Legal
          </span>
        </div>

        <h1 className="text-[2rem] leading-[1.05] sm:text-5xl font-semibold tracking-tight sm:leading-[1]">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground">
            <span className="font-mono text-[10px] text-foreground/85">
              {version}
            </span>
            <span className="w-px h-3 bg-border/70" />
            Last updated {lastUpdated}
          </span>
          <Link
            href="/changelog"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            What changed
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </header>

      {/* Two-column: sticky TOC + content */}
      <div className="flex gap-10">
        <LegalToc items={toc} />

        <div className="min-w-0 flex-1 max-w-3xl">
          <article
            className={
              "prose prose-invert prose-sm sm:prose-base " +
              "prose-headings:text-foreground prose-headings:scroll-mt-24 " +
              "prose-p:text-foreground/85 prose-li:text-foreground/85 " +
              "prose-strong:text-foreground prose-a:text-primary " +
              "max-w-none"
            }
          >
            {children}
          </article>

          {/* See also */}
          {seeAlso && seeAlso.length > 0 && (
            <div className="not-prose mt-12 pt-8 border-t border-border/60">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                See also
              </p>
              <div className="flex flex-wrap gap-2">
                {seeAlso.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/40 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {l.label}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
