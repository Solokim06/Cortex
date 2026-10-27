"use client";

import { useTranslations } from "next-intl";
import { UserButton } from "@clerk/nextjs";
import { AccountCard } from "../AccountCard";

export function AccountPanel() {
  const t = useTranslations("settings.panels.account");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">{t("heading")}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t("headingDescription")}
        </p>
      </div>

      <AccountCard />

      <div className="rounded-md border border-border bg-background/40 p-3.5 flex items-center gap-3">
        <div className="shrink-0">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-9 h-9",
              },
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{t("openMenuTitle")}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t("openMenuDescription")}
          </p>
        </div>
      </div>
    </div>
  );
}
