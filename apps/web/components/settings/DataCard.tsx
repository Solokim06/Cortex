"use client";

import { useTranslations } from "next-intl";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DataCard() {
  const t = useTranslations("settings.dataCard");

  const comingSoon = (label: string) => () =>
    toast.info(t("comingSoon", { label }), {
      description: t("comingSoonHint"),
    });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("exportTitle")}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {t("exportDescription")}
          </p>
        </div>
        <Button
          onClick={comingSoon(t("exportButton"))}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {t("exportButton")}
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-destructive">
            {t("deleteTitle")}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {t("deleteDescription")}
          </p>
        </div>
        <Button
          onClick={comingSoon(t("deleteTitle"))}
          variant="destructive"
          size="sm"
          className="shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          {t("deleteButton")}
        </Button>
      </div>
    </div>
  );
}
