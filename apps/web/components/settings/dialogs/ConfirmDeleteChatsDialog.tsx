"use client";

import { useTranslations } from "next-intl";
import { Loader2, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteAllChats } from "@/lib/hooks/use-user-prefs";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function ConfirmDeleteChatsDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("settings.panels.data");
  const del = useDeleteAllChats();

  const handleConfirm = () => {
    del.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(
          t("deleteChatsSuccess", { count: res.deleted_conversations }),
        );
        onOpenChange(false);
      },
      onError: () => {
        toast.error(t("deleteChatsFailed"));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteChatsConfirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("deleteChatsConfirmBody")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={del.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={del.isPending}
          >
            {del.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t("deleteChatsConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
