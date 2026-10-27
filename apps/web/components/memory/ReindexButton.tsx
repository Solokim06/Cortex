"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCortex } from "@/lib/hooks/use-cortex";

export function ReindexButton() {
  const t = useTranslations("memory.reindex");
  const [loading, setLoading] = useState(false);
  const cortex = useCortex();
  const qc = useQueryClient();

  const run = async () => {
    if (loading) return;
    setLoading(true);
    toast.loading(t("progressTitle"), {
      id: "reindex",
      description: t("progressDescription"),
    });
    try {
      const res = (await cortex.reindex()) as {
        indexed?: number;
        failed?: number;
        total?: number;
      };
      toast.success(t("successTitle"), {
        id: "reindex",
        description:
          typeof res?.indexed === "number"
            ? t("successDescription", {
                indexed: res.indexed,
                total: res.total ?? res.indexed,
                failedSuffix: res.failed
                  ? t("successDescriptionFailed", { count: res.failed })
                  : "",
              })
            : t("upToDate"),
      });
      qc.invalidateQueries({ queryKey: ["memory-search"] });
      qc.invalidateQueries({ queryKey: ["stats-nodes"] });
    } catch (e: unknown) {
      toast.error(t("failedTitle"), {
        id: "reindex",
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

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={loading}
      className="h-8 text-xs"
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          {t("reindexing")}
        </>
      ) : (
        <>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          {t("reindex")}
        </>
      )}
    </Button>
  );
}
