"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { Loader2, Wand2, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateMacro,
  useUpdateMacro,
} from "@/lib/hooks/use-admin-macros";
import type { Macro } from "@/lib/admin-api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode, otherwise edit mode */
  macro: Macro | null;
};

const VARIABLE_HINTS = [
  { name: "filer_name", desc: "Ticket author's name (or \"there\")" },
  { name: "filer_email", desc: "Ticket author's email" },
  { name: "ticket_id", desc: "Ticket UUID" },
  { name: "ticket_subject", desc: "Ticket subject line" },
  { name: "ticket_priority", desc: "urgent / high / normal / low" },
  { name: "admin_name", desc: "Your name (or \"The Cortex team\")" },
  { name: "greeting", desc: "\"Hi <name>,\" or \"Hi there,\"" },
  { name: "date", desc: "Today's date, ISO format" },
];

export function MacroEditorDialog({ open, onOpenChange, macro }: Props) {
  const t = useTranslations("admin.settings.macros");
  const isEdit = !!macro;

  // Initial state comes from the macro. The parent will re-mount this
  // component (via `key={macro?.id ?? "new"}`) whenever the target macro
  // changes, so we don't need an effect to sync.
  const [title, setTitle] = useState(macro?.title ?? "");
  const [body, setBody] = useState(macro?.body ?? "");
  const [tagsInput, setTagsInput] = useState((macro?.tags ?? []).join(", "));
  const [showHints, setShowHints] = useState(false);

  const createMutation = useCreateMacro();
  const updateMutation = useUpdateMacro();

  const busy = createMutation.isPending || updateMutation.isPending;


  const tags = tagsInput
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  const canSave = title.trim().length > 0 && body.trim().length > 0 && !busy;

  const handleSave = async () => {
    if (!canSave) return;

    const payload = {
      title: title.trim(),
      body,
      tags,
    };

    try {
      if (isEdit && macro) {
        await updateMutation.mutateAsync({ id: macro.id, ...payload });
        toast.success(t("macro_updated"));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t("macro_created"));
      }
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? t("update_failed") : t("create_failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            {isEdit ? t("dialog_edit_title") : t("dialog_new_title")}
          </DialogTitle>
          <DialogDescription>
            {t("dialog_description_before")}
            <code className="text-primary bg-primary/5 px-1 rounded">
              {"{{filer_name}}"}
            </code>
            {t("dialog_description_after")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {t("field_title")}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("field_title_placeholder")}
              maxLength={120}
              disabled={busy}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md",
                "border border-border bg-background",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-60",
              )}
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              {t("field_title_hint")}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {t("field_tags")}
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t("field_tags_placeholder")}
              disabled={busy}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md",
                "border border-border bg-background",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-60",
              )}
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              {t("field_tags_hint")}{" "}
              {t("field_tags_common")}
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium">{t("field_body")}</label>
              <button
                type="button"
                onClick={() => setShowHints((s) => !s)}
                className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Info className="w-3 h-3" />
                {showHints ? t("hide_variables") : t("show_variables")}
              </button>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {{filer_name}},\n\nThanks for reporting this. I'm looking into it now and will get back to you shortly.\n\n— {{admin_name}}"}
              rows={10}
              disabled={busy}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md font-mono",
                "border border-border bg-background resize-y min-h-45",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-60",
              )}
            />

            {showHints && (
              <div className="mt-2 rounded-md border border-border bg-card/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  {t("available_variables")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                  {VARIABLE_HINTS.map((v) => (
                    <div
                      key={v.name}
                      className="flex items-start gap-2 text-xs"
                    >
                      <code className="text-primary bg-primary/5 px-1 rounded shrink-0">
                        {`{{${v.name}}}`}
                      </code>
                      <span className="text-muted-foreground text-[11px]">
                        {v.desc}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-border/60 text-[10px] text-muted-foreground">
                  {t("fallback_hint")} <code>{"{{filer_name|there}}"}</code>
                  {t("fallback_hint_after")}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-2"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3" />
            )}
            {isEdit ? t("save_changes") : t("create_macro")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
