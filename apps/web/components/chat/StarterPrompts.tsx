"use client";

import { useTranslations } from "next-intl";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Starter = {
  label: string;
  prompt: string;
  hint: string;
};

type Props = {
  onSelect: (prompt: string) => void;
};

export function StarterPrompts({ onSelect }: Props) {
  const t = useTranslations("chat.starters");

  const starters: Starter[] = [
    {
      label: t("whatDoIKnowLabel"),
      prompt: t("whatDoIKnowPrompt"),
      hint: t("whatDoIKnowHint"),
    },
    {
      label: t("findConnectionsLabel"),
      prompt: t("findConnectionsPrompt"),
      hint: t("findConnectionsHint"),
    },
    {
      label: t("challengeMeLabel"),
      prompt: t("challengeMePrompt"),
      hint: t("challengeMeHint"),
    },
    {
      label: t("focusMeLabel"),
      prompt: t("focusMePrompt"),
      hint: t("focusMeHint"),
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4">
      {/* Icon + welcome */}
      <div className="rounded-full bg-primary/10 p-3 mb-4">
        <Sparkles className="w-6 h-6 text-primary" />
      </div>

      <h2 className="text-xl font-semibold tracking-tight text-center">
        {t("headline")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
        {t("subheadline")}
      </p>

      {/* Starter cards */}
      <div className="mt-8 grid gap-2 w-full max-w-2xl sm:grid-cols-2">
        {starters.map((starter) => (
          <button
            key={starter.label}
            onClick={() => onSelect(starter.prompt)}
            className={cn(
              "group text-left rounded-lg border border-border bg-card/40 p-4 transition-colors",
              "hover:border-primary/40 hover:bg-card",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {starter.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {starter.hint}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </button>
        ))}
      </div>

      <p className="mt-6 text-[11px] text-muted-foreground">
        {t("footerHint")}
      </p>
    </div>
  );
}
