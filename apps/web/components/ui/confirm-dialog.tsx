"use client";

import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in rose. Use for destructive actions. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** When true, disables both buttons and shows a spinner on confirm. */
  busy?: boolean;
};

/**
 * Reusable confirmation dialog.
 *
 * Usage:
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Delete this?"
 *     description="This cannot be undone."
 *     confirmLabel="Delete"
 *     destructive
 *     onConfirm={handleDelete}
 *   />
 *
 * Notes:
 *  - Enter key triggers confirm; Esc closes (handled by base-ui Dialog).
 *  - The confirm handler can be async; the dialog stays open while busy.
 *  - We don't auto-close on success — the caller decides (usually closes
 *    after the async work completes).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  busy = false,
}: Props) {
  const handleConfirm = () => {
    if (busy) return;
    void onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && (
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className={cn(
              "text-xs px-3 py-2 rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              "disabled:opacity-40 disabled:pointer-events-none transition-colors",
            )}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            autoFocus
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              destructive
                ? "bg-rose-500 text-white hover:bg-rose-500/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none transition-colors",
            )}
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
