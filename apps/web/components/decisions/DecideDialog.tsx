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
import { Check, Loader2, AlertTriangle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUpdateDecision } from "@/lib/hooks/use-decisions";
import type { DecisionDetail } from "@/lib/hooks/use-cortex";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  decision: DecisionDetail;
};

export function DecideDialog({ open, onOpenChange, decision }: Props) {
  const t = useTranslations("decisions.decideDialog");
  const tCommon = useTranslations("common");
  const [chosen, setChosen] = useState(decision.chosen_option ?? "");
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [reasoning, setReasoning] = useState(decision.reasoning ?? "");
  const [expectedOutcome, setExpectedOutcome] = useState(
    decision.expected_outcome ?? "",
  );
  const [reviewDays, setReviewDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestedDays =
    decision.analysis?.suggested_review_days &&
    decision.analysis.suggested_review_days > 0
      ? decision.analysis.suggested_review_days
      : 30;

  // Reset on open
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const existing = decision.chosen_option ?? "";
      const matchesOption = decision.options.some(
        (o) => o.name.trim().toLowerCase() === existing.trim().toLowerCase(),
      );
      setChosen(matchesOption ? existing : "");
      setCustomMode(existing.length > 0 && !matchesOption);
      setCustomValue(matchesOption ? "" : existing);
      setReasoning(decision.reasoning ?? "");
      setExpectedOutcome(decision.expected_outcome ?? "");
      setReviewDays(suggestedDays);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [open]);

  const update = useUpdateDecision(decision.id);

  const finalChosen = customMode ? customValue.trim() : chosen.trim();

  const submit = async () => {
    if (!finalChosen) {
      setError(t("errorPickOption"));
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        chosen_option: finalChosen,
        reasoning: reasoning.trim(),
        expected_outcome: expectedOutcome.trim(),
        review_days: reviewDays,
      });
      toast.success(t("successTitle"), {
        description: t("successDescription", { count: reviewDays }),
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
        if (!update.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {decision.question}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {decision.options.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t("whichOption")}
              </p>
              <div className="space-y-2">
                {decision.options.map((opt, i) => {
                  const isSelected =
                    !customMode &&
                    chosen.trim().toLowerCase() === opt.name.trim().toLowerCase();
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setChosen(opt.name);
                        setCustomMode(false);
                      }}
                      className={cn(
                        "w-full text-left flex items-start gap-2 rounded-md border p-3 transition-colors",
                        isSelected
                          ? "border-primary/60 bg-primary/5"
                          : "border-border bg-card/40 hover:border-primary/40",
                      )}
                    >
                      <div
                        className={cn(
                          "shrink-0 mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                          isSelected
                            ? "border-primary bg-primary/20 text-primary"
                            : "border-border",
                        )}
                      >
                        {isSelected && (
                          <Circle className="w-2 h-2 fill-current" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{opt.name}</p>
                        {opt.best_if && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            {t("bestIf", { condition: opt.best_if })}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setCustomMode(true);
                    setChosen("");
                  }}
                  className={cn(
                    "w-full text-left flex items-start gap-2 rounded-md border border-dashed p-3 transition-colors",
                    customMode
                      ? "border-primary/60 bg-primary/5"
                      : "border-border bg-card/20 hover:border-primary/40",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                      customMode
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border",
                    )}
                  >
                    {customMode && <Circle className="w-2 h-2 fill-current" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t("somethingElse")}</p>
                    {customMode && (
                      <Textarea
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        placeholder={t("customOptionPlaceholder")}
                        rows={2}
                        className="mt-1.5 resize-none text-xs"
                        maxLength={500}
                        autoFocus
                      />
                    )}
                  </div>
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t("whyThisOption")}
            </p>
            <Textarea
              ref={textareaRef}
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder={t("reasoningPlaceholder")}
              rows={3}
              className="resize-none text-sm"
              maxLength={3000}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t("expectedOutcomeTitle")}
            </p>
            <Textarea
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              placeholder={t("expectedOutcomePlaceholder")}
              rows={3}
              className="resize-none text-sm"
              maxLength={2000}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t("reviewTiming")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[7, 14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setReviewDays(d)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium border transition-colors",
                    reviewDays === d
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("daysShort", { count: d })}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={update.isPending || !finalChosen}
          >
            {update.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {t("saving")}
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5" />
                {t("commit")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
