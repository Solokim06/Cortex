"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BarChart3, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useGenerateReport } from "@/lib/hooks/use-reflections";
import type { Reflection } from "@/lib/hooks/use-cortex";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (reflection: Reflection) => void;
};

export function GenerateReportDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useTranslations("reflections.generateDialog");
  const tCommon = useTranslations("common");
  const [days, setDays] = useState(30);
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const generate = useGenerateReport();

  const windows = [
    { days: 7, label: t("window7Label"), desc: t("window7Desc") },
    { days: 30, label: t("window30Label"), desc: t("window30Desc") },
    { days: 90, label: t("window90Label"), desc: t("window90Desc") },
    { days: 180, label: t("window180Label"), desc: t("window180Desc") },
  ];

  const rotating = [
    t("status1"),
    t("status2"),
    t("status3"),
    t("status4"),
    t("status5"),
  ];

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDays(30);
      setStatusIndex(0);
      setError(null);
    }
  }

  useEffect(() => {
    if (!generate.isPending) return;
    const timer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % rotating.length);
    }, 2600);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate.isPending]);

  const submit = async () => {
    setError(null);
    try {
      const res = await generate.mutateAsync(days);
      toast.success(t("successTitle"), {
        description: t("successDescription", { days }),
      });
      onCreated?.(res.reflection);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : t("errorGeneric"),
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!generate.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {generate.isPending ? (
          <div className="py-8 flex flex-col items-center text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">{t("reflectingTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed min-h-8">
              {rotating[statusIndex]}
            </p>
            <div className="w-full max-w-60 h-1 mt-6 rounded-full bg-accent/40 overflow-hidden">
              <div className="h-full w-1/3 bg-primary/60 animate-pulse rounded-full" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              {t("timeHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t("howFarBack")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {windows.map((w) => (
                  <button
                    key={w.days}
                    type="button"
                    onClick={() => setDays(w.days)}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-colors",
                      days === w.days
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-card/40 hover:border-primary/40",
                    )}
                  >
                    <p className="text-sm font-medium">{w.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {w.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {!generate.isPending && (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={generate.isPending}
              >
                {tCommon("cancel")}
              </Button>
              <Button onClick={submit} disabled={generate.isPending}>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {t("generateReport")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
