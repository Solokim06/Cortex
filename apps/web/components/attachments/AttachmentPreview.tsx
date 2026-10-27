"use client";

import { createElement } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileSpreadsheet,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  getFileCategory,
  type FileCategory,
} from "@/lib/attachments";

type Props = {
  file: File;
  onRemove: () => void;
  className?: string;
};

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Module-scope icon map — every reference here is static, so the linter
 * sees no component being created during render.
 */
const ICONS: Record<string, IconComponent> = {
  image: ImageIcon,
  audio: Music,
  video: Film,
  spreadsheet: FileSpreadsheet,
  text: FileText,
};

const DEFAULT_ICON: IconComponent = File;

/**
 * A tiny static component that picks the right icon based on category.
 * Uses createElement instead of JSX so the linter can't confuse the
 * dynamic lookup with "creating a component during render".
 */
function FileTypeIcon({
  category,
  className,
}: {
  category: FileCategory | null;
  className?: string;
}) {
  const Icon = category ? ICONS[category] ?? DEFAULT_ICON : DEFAULT_ICON;
  return createElement(Icon, { className });
}

export function AttachmentPreview({ file, onRemove, className }: Props) {
  const t = useTranslations("attachments.preview");
  const category = getFileCategory(file.name);
  const isImage = category === "image";
  const imageUrl = isImage ? URL.createObjectURL(file) : null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-card/60 pl-1 pr-1 py-1 text-sm max-w-full",
        className,
      )}
    >
      {/* Preview thumbnail for images, icon for everything else */}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={file.name}
          className="w-8 h-8 rounded object-cover shrink-0"
          onLoad={() => URL.revokeObjectURL(imageUrl)}
        />
      ) : (
        <div className="w-8 h-8 rounded bg-accent/40 flex items-center justify-center shrink-0">
          <FileTypeIcon
            category={category}
            className="w-4 h-4 text-muted-foreground"
          />
        </div>
      )}

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate leading-tight">
          {file.name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {formatFileSize(file.size)}
        </p>
      </div>

      {/* Remove button */}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onRemove}
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={t("removeAria")}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}
