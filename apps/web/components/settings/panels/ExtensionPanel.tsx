"use client";

import { useTranslations } from "next-intl";
import { ExtensionConnectCard } from "../ExtensionConnectCard";

export function ExtensionPanel() {
  const t = useTranslations("settings.panels.extension");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t("heading")}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t("headingDescription")}
        </p>
      </div>
      <ExtensionConnectCard />
    </div>
  );
}
