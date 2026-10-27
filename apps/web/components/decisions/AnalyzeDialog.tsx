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
import { GitBranch, Loader2, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { useAnalyzeDecision } from "@/lib/hooks/use-decisions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (decisionId: string) => void;
};

export function AnalyzeDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useTranslations("decisions.analyzeDialog");
  const tCommon = useTranslations("common");
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);

  const analyze = useAnalyzeDecision();

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
      setQuestion("");
      setContext("");
      setStatusIndex(0);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => questionRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!analyze.isPending) return;
    const timer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % rotating.length);
    }, 2600);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyze.isPending]);

  // ---- Option D: accept either field ----
  const finalQuestion = question.trim() || context.trim();
  const finalContext = question.trim() ? context.trim() : "";

  const submit = async () => {
    if (finalQuestion.length < 5) {
      setError(t("errorTooShort"));
      questionRef.current?.focus();
      return;
    }
    setError(null);
    try {
      const res = await analyze.mutateAsync({
        question: finalQuestion,
        context: finalContext,
      });
      toast.success(t("successTitle"), {
        description: t("successDescription", {
          count: res.options.length,
        }),
      });
      onCreated?.(res.decision.id);
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  const showPromotionHint =
    question.trim().length < 5 && context.trim().length >= 5;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!analyze.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {analyze.isPending ? (
          <div className="py-8 flex flex-col items-center text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">{t("analyzingTitle")}</p>
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
              <label className="text-xs font-medium text-muted-foreground">
                {t("questionLabel")}
              </label>
              <Textarea
                ref={questionRef}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={onKeyDown}
                placeholder={t("questionPlaceholder")}
                rows={3}
                className="mt-1 resize-none"
                maxLength={500}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("contextLabel")}{" "}
                <span className="opacity-60">{t("optional")}</span>
              </label>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("contextPlaceholder")}
                rows={4}
                className="mt-1 resize-none"
                maxLength={3000}
              />
            </div>

            {showPromotionHint && (
              <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="leading-relaxed">
                  {t.rich("promotionHint", {
                    strong: (chunks) => (
                      <span className="font-medium">{chunks}</span>
                    ),
                  })}
                </span>
              </div>
            )}

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {!analyze.isPending && (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={analyze.isPending}
              >
                {tCommon("cancel")}
              </Button>
              <Button onClick={submit} disabled={analyze.isPending}>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {t("analyze")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
