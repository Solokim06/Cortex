"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles, Loader2, RefreshCw, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCortex } from "@/lib/hooks/use-cortex";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  hasModel: boolean;
  /** Locale the current model was generated in (from GET /identity/). */
  modelLocale?: string | null;
};

export function RebuildButton({ hasModel, modelLocale }: Props) {
  const t = useTranslations("identity.rebuild");
  const currentLocale = useLocale();
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const cortex = useCortex();
  const queryClient = useQueryClient();

  const localeDiffers =
    hasModel && modelLocale && modelLocale !== currentLocale;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["identity"] });
    queryClient.invalidateQueries({ queryKey: ["identity-timeline"] });
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRebuild = async () => {
    if (hasModel) {
      setConfirmOpen(true);
      return;
    }
    await runRebuild();
  };

  const runRebuild = async () => {
    setConfirmOpen(false);
    setLoading(true);
    toast.loading(t("progressTitle"), {
      id: "identity-rebuild",
      description: t("progressDescription"),
    });

    try {
      await cortex.rebuildIdentity();
      toast.success(t("successTitle"), {
        id: "identity-rebuild",
        description: t("successDescription"),
      });
      invalidate();
    } catch (e: unknown) {
      toast.error(t("failedTitle"), {
        id: "identity-rebuild",
        description:
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : t("genericError"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    setTranslating(true);
    toast.loading(t("progressTitle"), {
      id: "identity-rebuild",
      description: t("progressDescription"),
    });

    try {
      // The identity engine reads the previous snapshot's locale; when
      // it differs from the current request's locale, it translates
      // item names instead of preserving them.
      await cortex.rebuildIdentity();
      toast.success(t("successTitle"), {
        id: "identity-rebuild",
        description: t("successDescription"),
      });
      invalidate();
    } catch (e: unknown) {
      toast.error(t("failedTitle"), {
        id: "identity-rebuild",
        description:
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : t("genericError"),
      });
    } finally {
      setTranslating(false);
    }
  };

  const busy = loading || translating;

  return (
    <>
      <div className="flex items-center gap-2">
        {localeDiffers && (
          <Button
            onClick={handleTranslate}
            disabled={busy}
            size="sm"
            variant="outline"
            title={t("translateHint", { from: modelLocale ?? "", to: currentLocale })}
          >
            {translating ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Languages className="w-4 h-4 mr-1.5" />
            )}
            {translating ? t("translating") : t("translateToCurrent")}
          </Button>
        )}

        <Button onClick={handleRebuild} disabled={busy} size="sm">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              {t("rebuilding")}
            </>
          ) : hasModel ? (
            <>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              {t("rebuildIdentity")}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-1.5" />
              {t("buildMyIdentity")}
            </>
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirmRebuild")}
        description={t("confirm_description")}
        confirmLabel={t("confirm_rebuild")}
        cancelLabel={t("cancel")}
        destructive
        busy={loading}
        onConfirm={runRebuild}
      />
    </>
  );
}
