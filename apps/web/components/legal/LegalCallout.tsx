"use client";

import { Info, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CalloutKind = "info" | "warning" | "promise" | "tip";

const KIND_STYLES: Record<
  CalloutKind,
  { Icon: typeof Info; tone: string }
> = {
  info: {
    Icon: Info,
    tone: "border-sky-500/25 bg-sky-500/[0.06] text-sky-500 dark:text-sky-400",
  },
  warning: {
    Icon: AlertTriangle,
    tone: "border-amber-500/30 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
  },
  promise: {
    Icon: ShieldCheck,
    tone: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400",
  },
  tip: {
    Icon: Sparkles,
    tone: "border-primary/25 bg-primary/[0.06] text-primary",
  },
};

export function LegalCallout({
  kind = "info",
  title,
  children,
}: {
  kind?: CalloutKind;
  title?: string;
  children: ReactNode;
}) {
  const { Icon, tone } = KIND_STYLES[kind];

  return (
    <div className={cn("not-prose rounded-lg border px-4 py-3.5 my-5", tone)}>
      <div className="flex gap-2.5">
        <Icon className="w-4 h-4 shrink-0 mt-[2px]" />
        <div className="min-w-0 flex-1 text-[12px] leading-relaxed">
          {title && (
            <p className="font-medium mb-1 text-foreground/95">{title}</p>
          )}
          <div className="text-foreground/80">{children}</div>
        </div>
      </div>
    </div>
  );
}
