"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "emerald" | "amber" | "violet" | "sky" | "rose";

type Props = {
  icon: LucideIcon;
  value: string | number;
  label: string;
  /** Small secondary line (e.g. "+3 this week") */
  sub?: string;
  /** Color of the sub line — only applied if provided */
  subTone?: "neutral" | "positive" | "negative";
  /** Icon tint */
  tone?: Tone;
  /** Optional href — makes the whole tile a link */
  href?: string;
  loading?: boolean;
};

const TONES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const SUB_TONES = {
  neutral: "text-muted-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
} as const;

export function StatTile({
  icon: Icon,
  value,
  label,
  sub,
  subTone = "neutral",
  tone = "primary",
  href,
  loading = false,
}: Props) {
  const inner = (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/40 p-3 flex flex-col gap-1.5 transition-colors",
        href && "hover:border-primary/40 hover:bg-card/60",
      )}
    >
      <div
        className={cn(
          "rounded-md w-7 h-7 flex items-center justify-center shrink-0",
          TONES[tone],
        )}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>

      {loading ? (
        <>
          <div className="h-6 w-12 bg-accent/40 rounded animate-pulse" />
          <div className="h-3 w-20 bg-accent/40 rounded animate-pulse" />
        </>
      ) : (
        <>
          <span className="text-xl font-semibold tabular-nums leading-none">
            {value}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">
              {label}
            </p>
            {sub && (
              <p
                className={cn(
                  "text-[10px] font-medium truncate mt-0.5",
                  SUB_TONES[subTone],
                )}
              >
                {sub}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}
