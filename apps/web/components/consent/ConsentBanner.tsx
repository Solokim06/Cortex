"use client";

import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConsent } from "./ConsentContext";

export function ConsentBanner() {
  const t = useTranslations("consent.banner");
  const { consent, loading, acceptAll, denyAll, openPreferences } = useConsent();

  // Nothing to show while loading, or once the user has decided
  if (loading || consent !== null) return null;

  return (
    <>
      <div
        role="region"
        aria-label={t("ariaLabel")}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[60]",
          "border-t border-border/80 bg-card/95 backdrop-blur-sm",
          "px-4 py-3 sm:px-6",
        )}
      >
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Cookie className="hidden sm:block w-5 h-5 text-muted-foreground shrink-0" />

          <div className="flex-1 min-w-0">
            <p className="text-[13px] leading-relaxed text-foreground/90">
              <span className="font-medium">{t("title")}</span>{" "}
              <span className="text-muted-foreground">{t("body")}</span>{" "}
              <Link
                href="/privacy/cookies"
                className="text-primary hover:underline"
              >
                {t("learnMore")}
              </Link>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={openPreferences}
              className="text-[12px] h-8"
            >
              {t("manage")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={denyAll}
              className="text-[12px] h-8"
            >
              {t("denyAll")}
            </Button>
            <Button
              size="sm"
              onClick={acceptAll}
              className="text-[12px] h-8"
            >
              {t("acceptAll")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
