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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCreateGoal } from "@/lib/hooks/use-learning";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (goalId: string) => void;
  /** Prefill the title (used by example chips) */
  initialTitle?: string;
};

export function CreateGoalDialog({
  open,
  onOpenChange,
  onCreated,
  initialTitle,
}: Props) {
  const t = useTranslations("learning.createDialog");
  const tCommon = useTranslations("common");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const create = useCreateGoal();

  // Rotating status messages shown while the LLM call is in flight.
  const rotatingStatus = [
    t("status1"),
    t("status2"),
    t("status3"),
    t("status4"),
    t("status5"),
  ];

  // Reset when opening
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle(initialTitle ?? "");
      setDescription("");
      setError(null);
      setStatusIndex(0);
    }
  }

  // Focus after open animation
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open]);

  // Rotate the loading status while creating (nice during a 10-30s LLM call)
  useEffect(() => {
    if (!create.isPending) return;
    const timer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % rotatingStatus.length);
    }, 3200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.isPending]);

  const submit = async () => {
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setError(t("errorTitleTooShort"));
      return;
    }
    setError(null);
    try {
      const res = await create.mutateAsync({
        title: trimmed,
        description: description.trim(),
      });
      toast.success(t("successTitle"), {
        description: t("successDescription"),
      });
      onCreated?.(res.goal.id);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!create.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {create.isPending ? (
          <div className="py-8 flex flex-col items-center text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">
              {t("buildingTitle")}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed min-h-[32px]">
              {rotatingStatus[statusIndex]}
            </p>
            <div className="w-full max-w-[240px] h-1 mt-6 rounded-full bg-accent/40 overflow-hidden">
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
                {t("goalTitleLabel")}
              </label>
              <Input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("goalTitlePlaceholder")}
                className="mt-1"
                disabled={create.isPending}
                maxLength={200}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("descriptionLabel")}{" "}
                <span className="opacity-60">{t("optional")}</span>
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={t("descriptionPlaceholder")}
                className="mt-1 resize-none"
                rows={4}
                disabled={create.isPending}
                maxLength={2000}
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
          {!create.isPending && (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={create.isPending}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                onClick={submit}
                disabled={create.isPending || title.trim().length < 3}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {t("createPlan")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
