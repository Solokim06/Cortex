"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Sparkles } from "lucide-react";
import { ActionsHistory } from "@/components/actions/ActionsHistory";

export default function ActionsPage() {
  const t = useTranslations("agent.page");

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 md:px-6 pt-4 pb-4 border-b border-border/60">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
              <Link
                href="/memory"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                {t("backToMemory")}
              </Link>
              <span className="opacity-40">/</span>
              <span className="text-foreground">{t("pageTitle")}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {t("pageTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pageSubtitle")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
            <ActionsHistory />
          </div>
        </div>
      </div>
    </div>
  );
}
