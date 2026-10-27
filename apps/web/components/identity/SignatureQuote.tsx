"use client";

import { useTranslations } from "next-intl";
import { Quote } from "lucide-react";
import { useIdentitySignature } from "@/lib/hooks/use-cortex";

export function SignatureQuote() {
  const t = useTranslations("identity.signature");
  const { data, isLoading } = useIdentitySignature();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-gradient-to-br from-card/60 to-card/20 p-8 space-y-4">
        <div className="h-3 w-8 bg-primary/30 rounded animate-pulse" />
        <div className="h-6 bg-accent/40 rounded w-3/4 animate-pulse" />
        <div className="h-6 bg-accent/40 rounded w-1/2 animate-pulse" />
        <div className="h-3 w-32 bg-accent/30 rounded animate-pulse mt-4" />
      </div>
    );
  }

  if (!data?.available || !data.quote) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/20 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0 mt-0.5">
            <Quote className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("notReadyTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("notReadyHint")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-border bg-gradient-to-br from-primary/5 via-card/40 to-card/10 p-6 md:p-8 overflow-hidden">
      <Quote
        className="absolute top-4 right-4 w-16 h-16 text-primary/10 pointer-events-none"
        aria-hidden
      />

      <div className="relative space-y-3 max-w-2xl">
        <p className="text-[10px] uppercase tracking-widest text-primary font-medium">
          {t("label")}
        </p>

        <blockquote className="text-lg md:text-xl font-medium leading-snug text-foreground/95 text-balance">
          &ldquo;{data.quote}&rdquo;
        </blockquote>

        <div className="flex items-center gap-2 pt-2">
          <div className="h-px w-6 bg-border" aria-hidden />
          <p className="text-xs text-muted-foreground italic">
            {data.title
              ? t.rich("attributionWithTitle", {
                  title: data.title,
                  span: (chunks) => (
                    <span className="not-italic text-foreground/60">
                      {chunks}
                    </span>
                  ),
                })
              : t("attribution")}
          </p>
        </div>
      </div>
    </div>
  );
}
