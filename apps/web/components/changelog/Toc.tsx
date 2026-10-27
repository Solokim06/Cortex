"use client";

import { useEffect, useState } from "react";
import type { Release } from "@/lib/changelog";
import { releaseAnchor } from "@/lib/changelog";

export function ChangelogToc({ releases }: { releases: Release[] }) {
  const [activeId, setActiveId] = useState<string | null>(
    releases[0] ? releaseAnchor(releases[0]) : null,
  );

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    for (const r of releases) {
      const el = document.getElementById(releaseAnchor(r));
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(releaseAnchor(r));
        },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [releases]);

  return (
    <nav
      aria-label="Releases"
      className="hidden lg:block sticky top-20 self-start w-56 shrink-0"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 px-2">
        All releases
      </p>
      <ul className="space-y-0.5 border-l border-border/60">
        {releases.map((r) => {
          const id = releaseAnchor(r);
          const active = id === activeId;
          return (
            <li key={r.version}>
              <a
                href={`#${id}`}
                className={`flex items-center justify-between gap-2 pl-3 pr-2 py-1.5 text-[12px] leading-snug transition-colors border-l-2 -ml-px ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="font-mono text-[11px] truncate">
                  {r.version}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {new Date(r.date).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
