"use client";

import { useTranslations } from "next-intl";
import { Cookie, Shield, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "../Section";
import { useConsent } from "@/components/consent/ConsentContext";

export function PrivacyPanel() {
  const t = useTranslations("settings.privacy");
  const { consent, hasDecided, reset, openPreferences } = useConsent();

  const updated = consent?.updatedAt
    ? new Date(consent.updatedAt).toLocaleString()
    : null;

  return (
    <div className="space-y-8">
      <Section
        id="privacy-consent"
        icon={Cookie}
        title={t("consentTitle")}
        description={t("consentDescription")}
        tone="violet"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Cookie className="w-4 h-4 text-muted-foreground" />
              <p className="text-[13px] font-medium">
                {hasDecided ? t("currentChoice") : t("noChoiceYet")}
              </p>
            </div>

            {consent && (
              <div className="text-[12px] text-muted-foreground space-y-1 pl-6">
                <p>
                  {t("personalization")}:{" "}
                  <span className="text-foreground">
                    {consent.personalization ? t("on") : t("off")}
                  </span>
                </p>
                <p>
                  {t("performance")}:{" "}
                  <span className="text-foreground">
                    {consent.performance ? t("on") : t("off")}
                  </span>
                </p>
                <p>
                  {t("aiProcessing")}:{" "}
                  <span className="text-foreground">
                    {consent.aiProcessing ? t("on") : t("off")}
                  </span>
                </p>
                <p>
                  {t("marketing")}:{" "}
                  <span className="text-foreground">
                    {consent.marketing ? t("on") : t("off")}
                  </span>
                </p>
                {updated && (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    {t("lastUpdated", { date: updated })}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openPreferences}
              className="text-[12px]"
            >
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              {t("manageConsent")}
            </Button>
            {hasDecided && (
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-[12px] text-muted-foreground"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                {t("resetConsent")}
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section
        id="privacy-policy"
        icon={Shield}
        title={t("policyTitle")}
        description={t("policyDescription")}
        tone="sky"
      >
        <div className="space-y-2">
          <a
            href="/privacy/cookies"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline"
          >
            {t("viewCookiePolicy")}
            <ExternalLink className="w-3 h-3" />
          </a>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("policyFootnote")}
          </p>
        </div>
      </Section>

    </div>
  );
}
