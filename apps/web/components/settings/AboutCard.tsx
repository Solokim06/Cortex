"use client";

import { useTranslations } from "next-intl";
import { Brain, ExternalLink, Code2 } from "lucide-react";

const VERSION = "0.1.0";

export function AboutCard() {
  const t = useTranslations("settings.aboutCard");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 shrink-0">
          <Brain className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {t("description")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2">
            {t("versionLabel")} <span className="font-mono">{VERSION}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-border/60">
        <a
          href="https://github.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/40"
        >
          <Code2 className="w-3.5 h-3.5" />
          {t("source")}
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
        <a
          href="https://clerk.com/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/40"
        >
          {t("docs")}
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}
