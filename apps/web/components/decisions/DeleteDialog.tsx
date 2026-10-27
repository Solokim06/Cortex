"use client";

import { useState } from "react";
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
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDeleteDecision } from "@/lib/hooks/use-decisions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  decisionId: string;
  question: string;
  onDeleted?: () => void;
};

export function DeleteDialog({
  open,
  onOpenChange,
  decisionId,
  question,
  onDeleted,
}: Props) {
  const t = useTranslations("decisions.deleteDialog");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const del = useDeleteDecision(decisionId);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError(null);
  }

  const submit = async () => {
    setError(null);
    try {
      await del.mutateAsync();
      toast.success(t("successTitle"), {
        description: t("successDescription"),
      });
      onOpenChange(false);
      onDeleted?.();
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
        if (!del.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-md bg-destructive/10 p-1.5">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </span>
            {t("title")}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            <span className="text-foreground/90 font-medium line-clamp-3 block mb-2">
              &ldquo;{question}&rdquo;
            </span>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={del.isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={del.isPending}
          >
            {del.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {t("deleting")}
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {tCommon("delete")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
