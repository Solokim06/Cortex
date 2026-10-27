"use client";

import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useRecordOutcome } from "@/lib/hooks/use-decisions";
import type { DecisionDetail } from "@/lib/hooks/use-cortex";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  decision: DecisionDetail;
};

export function OutcomeDialog({ open, onOpenChange, decision }: Props) {
  const t = useTranslations("decisions.outcomeDialog");
  const tCommon = useTranslations("common");
  const [outcome, setOutcome] = useState(decision.actual_outcome ?? "");
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const record = useRecordOutcome(decision.id);

  const rotating = [
    t("status1"),
    t("status2"),
    t("status3"),
    t("status4"),
  ];

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setOutcome(decision.actual_outcome ?? "");
      setStatusIndex(0);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!record.isPending) return;
    const timer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % rotating.length);
    }, 2600);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.isPending]);

  const submit = async () => {
    const trimmed = outcome.trim();
    if (trimmed.length < 3) {
      setError(t("errorTooShort"));
      return;
    }
    setError(null);
    try {
      await record.mutateAsync(trimmed);
      toast.success(t("successTitle"), {
        description: t("successDescription"),
      });
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
        if (!record.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {decision.question}
          </DialogDescription>
        </DialogHeader>

        {record.isPending ? (
          <div className="py-8 flex flex-col items-center text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">{t("extractingTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed min-h-[32px]">
              {rotating[statusIndex]}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {decision.expected_outcome && (
              <div className="rounded-md border border-border bg-card/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {t("youExpectedLabel")}
                </p>
                <p className="text-xs leading-relaxed">
                  {decision.expected_outcome}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {t("whatHappenedLabel")}
              </p>
              <Textarea
                ref={textareaRef}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder={t("whatHappenedPlaceholder")}
                rows={5}
                className="resize-none text-sm"
                maxLength={3000}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {!record.isPending && (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={record.isPending}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                onClick={submit}
                disabled={record.isPending || outcome.trim().length < 3}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {t("extractLesson")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
