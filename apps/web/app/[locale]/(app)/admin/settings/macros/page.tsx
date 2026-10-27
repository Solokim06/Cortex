"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import {
  Plus,
  Wand2,
  Loader2,
  Pencil,
  Trash2,
  TrendingUp,
  Tag as TagIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { MacroEditorDialog } from "@/components/admin/settings/MacroEditorDialog";
import {
  useAdminMacros,
  useAdminMacroUsage,
  useDeleteMacro,
} from "@/lib/hooks/use-admin-macros";
import type { Macro } from "@/lib/admin-api";

export default function MacrosSettingsPage() {
  const t = useTranslations("admin.settings.macros");
  const macrosQuery = useAdminMacros();
  const usageQuery = useAdminMacroUsage();
  const deleteMutation = useDeleteMacro();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Macro | null>(null);

  const openCreate = () => {
    setEditingMacro(null);
    setDialogOpen(true);
  };

  const openEdit = (m: Macro) => {
    setEditingMacro(m);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      toast.success(t("delete_success", { title: pendingDelete.title }));
      setPendingDelete(null);
    } catch {
      toast.error(t("delete_failed"));
    }
  };

  // Build a quick lookup of usage counts keyed by macro id
  const usageById = new Map(
    (usageQuery.data ?? []).map((u) => [u.macro_id, u.uses]),
  );

  return (
    <div className="px-5 py-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-sm font-medium mb-1">{t("page_title")}</h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            {t("page_subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          {t("new_macro")}
        </button>
      </div>

      {/* Loading */}
      {macrosQuery.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("loading")}
        </div>
      )}

      {/* Error */}
      {macrosQuery.isError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
{t("load_error")}
        </div>
      )}

      {/* Empty */}
      {!macrosQuery.isLoading && macrosQuery.data?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Wand2 className="w-8 h-8 opacity-40" />
          <p className="text-sm">{t("empty_title")}</p>
          <button
            type="button"
            onClick={openCreate}
            className="text-xs text-primary hover:underline"
          >
            {t("empty_cta")}
          </button>
        </div>
      )}

      {/* List */}
      {macrosQuery.data && macrosQuery.data.length > 0 && (
        <div className="space-y-2">
          {macrosQuery.data.map((macro) => (
            <MacroRow
              key={macro.id}
              macro={macro}
              usage={usageById.get(macro.id) ?? 0}
              onEdit={() => openEdit(macro)}
              onDelete={() => setPendingDelete(macro)}
            />
          ))}
        </div>
      )}

      {/* Editor dialog — key forces remount when switching macro/mode */}
      <MacroEditorDialog
        key={editingMacro?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingMacro(null);
        }}
        macro={editingMacro}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("delete_title")}
        description={
          pendingDelete
            ? t("delete_body", { title: pendingDelete.title })
            : ""
        }
        confirmLabel={t("delete_button")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={confirmDelete}
        busy={deleteMutation.isPending}
      />
    </div>
  );
}

// =====================================================================
// row
// =====================================================================

function MacroRow({
  macro,
  usage,
  onEdit,
  onDelete,
}: {
  macro: Macro;
  usage: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.settings.macros");
  // First line of the body as a preview
  const preview = macro.body.split("\n")[0];

  return (
    <div className="group rounded-lg border border-border bg-card/40 px-4 py-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center mt-0.5">
          <Wand2 className="w-3.5 h-3.5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {macro.title}
            </span>
            {macro.tags.length > 0 && (
              <div className="flex items-center gap-1">
                {macro.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    <TagIcon className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
                {macro.tags.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{macro.tags.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-1 truncate">
            {preview}
          </p>

          {usage > 0 && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              {t("used_n", { n: usage })}
            </div>
          )}
        </div>

        {/* Actions — appear on hover / focus-within */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label={t("edit_aria", { title: macro.title })}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            aria-label={t("delete_aria", { title: macro.title })}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
