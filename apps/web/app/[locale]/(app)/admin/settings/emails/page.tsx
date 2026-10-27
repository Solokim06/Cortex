"use client";

import { useTranslations } from "next-intl";

import { EmailsStatsHeader } from "@/components/admin/settings/EmailsStatsHeader";
import { EmailTestForm } from "@/components/admin/settings/EmailTestForm";
import { EmailDeliveriesTable } from "@/components/admin/settings/EmailDeliveriesTable";
import { EmailSuppressionsList } from "@/components/admin/settings/EmailSuppressionsList";

export default function EmailsSettingsPage() {
  const t = useTranslations("admin.settings.emails");
  return (
    <div className="px-5 py-5 max-w-4xl space-y-5">
      {/* Header + master toggle + stats */}
      <EmailsStatsHeader />

      {/* Send test email */}
      <EmailTestForm />

      {/* Recent deliveries (with filter + pagination) */}
      <EmailDeliveriesTable />

      {/* Suppression list */}
      <EmailSuppressionsList />

      {/* Footer note */}
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        {t("page_footer_before")}{" "}
        <code className="text-foreground/70 bg-muted/40 px-1 rounded">
          {t("page_footer_env")}
        </code>{" "}
        {t("page_footer_after")}
      </p>
    </div>
  );
}
