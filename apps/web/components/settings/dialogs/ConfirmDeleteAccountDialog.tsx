"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteAccount } from "@/lib/hooks/use-user-prefs";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userEmail: string;
};

export function ConfirmDeleteAccountDialog({
  open,
  onOpenChange,
  userEmail,
}: Props) {
  const t = useTranslations("settings.panels.data");
  const del = useDeleteAccount();
  const { signOut } = useClerk();
  const router = useRouter();

  const [typed, setTyped] = useState("");

  const matches =
    typed.trim().toLowerCase() === (userEmail || "").trim().toLowerCase();

  const handleConfirm = () => {
    if (!matches) return;
    del.mutate(userEmail, {
      onSuccess: async () => {
        toast.success(t("deleteAccountSuccess"));
        // Close the dialog and start navigating immediately — don't
        // wait on Clerk. If signOut hangs, we've already left the page.
        onOpenChange(false);
        router.replace("/");
        // Belt-and-suspenders: if client-side navigation is blocked by
        // middleware (e.g., Clerk still sees the session), force a hard
        // reload after a short delay.
        setTimeout(() => {
          if (typeof window !== "undefined") {
            // Belt-and-suspenders: hard-reload to "/" if client-side
            // nav was blocked. window.location.href is intentional here —
            // router.push() would fail the same way router.replace() did
            // if Clerk middleware is still blocking the session.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/";
          }
        }, 1500);
        // Best-effort sign-out with a 3s ceiling. If Clerk is slow,
        // we don't care — the user is already gone.
        try {
          await Promise.race([
            signOut(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("signOut timeout")), 3000),
            ),
          ]);
        } catch {
          // ignore — we've already navigated away
        }
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : t("deleteAccountFailed"),
        );
      },
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteAccountConfirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("deleteAccountConfirmBody")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <p className="text-xs text-muted-foreground">
            {t("deleteAccountTypeEmail", { email: userEmail })}
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("deleteAccountEmailPlaceholder")}
            autoComplete="off"
            disabled={del.isPending}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={del.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!matches || del.isPending}
          >
            {del.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t("deleteAccountConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
