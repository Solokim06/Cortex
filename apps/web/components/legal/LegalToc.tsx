"use client";

import { useEffect, useState } from "react";

export type LegalTocItem = {
  id: string;
  number: string;
  label: string;
};

export function LegalToc({ items }: { items: LegalTocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(
    items[0]?.id ?? null,
  );

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(item.id);
        },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [items]);

  return (
    <nav
      aria-label="On this page"
      className="hidden lg:block sticky top-20 self-start w-56 shrink-0"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 px-2">
        On this page
      </p>
      <ul className="space-y-0.5 border-l border-border/60">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`flex items-center gap-2 pl-3 pr-2 py-1.5 text-[12px] leading-snug transition-colors border-l-2 -ml-px ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0 w-4">
                  {item.number}
                </span>
                <span className="truncate">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
