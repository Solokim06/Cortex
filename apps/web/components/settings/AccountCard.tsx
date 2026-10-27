"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useExtensionMe } from "@/lib/hooks/use-extension";

export function AccountCard() {
  const t = useTranslations("settings.accountCard");
  const { data, isLoading, isError } = useExtensionMe();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        {t("loadFailed")}
      </p>
    );
  }

  const fullName = [data.first_name, data.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Row label={t("nameLabel")} value={fullName || "—"} />
      <Row label={t("emailLabel")} value={data.email || "—"} />
      <Row label={t("userIdLabel")} value={data.user_id} mono />
    </dl>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          "text-sm mt-0.5 truncate " + (mono ? "font-mono text-xs" : "")
        }
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
