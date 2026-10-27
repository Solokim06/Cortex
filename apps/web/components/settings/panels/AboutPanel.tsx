"use client";

import { useTranslations } from "next-intl";
import { Brain, ExternalLink, FileText, Shield } from "lucide-react";

const VERSION = "0.1.0";

export function AboutPanel() {
  const t = useTranslations("settings.panels.about");

  const openExternal = (href: string) => () => {
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">{t("heading")}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t("headingDescription")}
        </p>
      </div>

      {/* Identity card */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-4">
        <Brain className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("brandTitle")}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t("brandDescription")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2.5">
            {t("versionLabel")}{" "}
            <span className="font-mono text-foreground/80">{VERSION}</span>
          </p>
        </div>
      </div>

      {/* Legal links — buttons, not <a href="#"> */}
      <div className="rounded-lg border border-border bg-background/40 divide-y divide-border/60">
        <Row
          icon={FileText}
          label={t("termsLabel")}
          viewLabel={t("viewLabel")}
          onClick={openExternal("/terms")}
        />
        <Row
          icon={Shield}
          label={t("privacyLabel")}
          viewLabel={t("viewLabel")}
          onClick={openExternal("/privacy")}
        />
      </div>

      {/* Project links — real external URLs */}
      <div className="flex items-center gap-2 pt-1">
        <a
          href="/support"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-accent/40"
        >
          {t("docs")}
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  viewLabel,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  viewLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-accent/30 transition-colors group text-left"
    >
      <div className="flex items-center gap-2.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-[11px] text-muted-foreground rounded-md border border-border px-2.5 py-1">
        {viewLabel}
      </span>
    </button>
  );
}
