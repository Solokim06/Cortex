"use client";

import { cn } from "@/lib/utils";

type Props = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  tone?: "primary" | "amber" | "emerald" | "sky" | "violet" | "muted";
};

const TONES = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  muted: "bg-accent/40 text-muted-foreground",
};

export function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  className,
  tone = "primary",
}: Props) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 rounded-lg border border-border bg-card/40 p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className={cn("rounded-md p-2 shrink-0", TONES[tone])}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-medium tracking-tight">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}
