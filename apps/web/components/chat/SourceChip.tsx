"use client";

import { useState, useRef, useEffect, createElement } from "react";
import { useTranslations } from "next-intl";
import { FileText, Brain, Lightbulb, GitBranch, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSourcePreview } from "./SourcePreviewContext";

type Props = {
  title: string;
  nodeId?: string;
};

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Module-scope icon map — every reference here is static, so ESLint
 * sees no component being created during render.
 */
const ICONS: Record<string, IconComponent> = {
  thought: FileText,
  concept: Brain,
  reflection: Lightbulb,
  decision: GitBranch,
};

const DEFAULT_ICON: IconComponent = Layers;

/**
 * A tiny static component that picks the right icon based on `type`.
 * Uses createElement instead of `<Icon />` so the linter can't confuse
 * the dynamic lookup with "creating a component during render".
 */
function TypeIcon({
  type,
  className,
}: {
  type: string | null | undefined;
  className?: string;
}) {
  const key = (type ?? "").toLowerCase();
  const Icon = ICONS[key] ?? DEFAULT_ICON;
  return createElement(Icon, { className });
}

export function SourceChip({ title, nodeId }: Props) {
  const t = useTranslations("chat.sourceChip");
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { openSource } = useSourcePreview();

  // Compute tooltip position on hover
  useEffect(() => {
    if (!hovered || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 300),
    });
  }, [hovered]);

  const isLinked = !!nodeId;

  const handleMouseEnter = () => {
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (nodeId) {
      openSource(nodeId);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 mx-0.5 text-[11px] font-medium align-middle transition-colors",
          isLinked
            ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
            : "border-border bg-accent/30 text-muted-foreground cursor-default",
        )}
        aria-label={
          isLinked
            ? t("openAria", { title })
            : t("plainAria", { title })
        }
      >
        <TypeIcon type={undefined} className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate max-w-45">{title}</span>
      </button>

      {hovered && isLinked && nodeId && (
        <ChipPreview
          title={title}
          nodeId={nodeId}
          top={position?.top}
          left={position?.left}
        />
      )}
    </>
  );
}

/**
 * Hover preview — a small floating card with node title + short preview.
 */
function ChipPreview({
  title,
  nodeId,
  top,
  left,
}: {
  title: string;
  nodeId: string;
  top?: number;
  left?: number;
}) {
  const t = useTranslations("chat.sourceChip");
  const { getPreview } = useSourcePreview();
  const preview = getPreview(nodeId);

  return (
    <div
      className="fixed z-50 w-72 rounded-md border border-border bg-popover shadow-xl p-3 pointer-events-none"
      style={{
        top: top ?? 0,
        left: left ?? 0,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
          <TypeIcon type={preview?.type} className="w-3 h-3 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {preview?.title || title}
          </p>
          {preview?.type && (
            <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
              {preview.type}
            </p>
          )}
          {preview?.summary && (
            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-3 leading-snug">
              {preview.summary}
            </p>
          )}
          {!preview && (
            <p className="text-[11px] text-muted-foreground mt-1.5 italic">
              {t("loadingPreview")}
            </p>
          )}
        </div>
      </div>
      <p className="text-[10px] text-primary mt-2 pt-2 border-t border-border/60">
        {t("clickToOpen")}
      </p>
    </div>
  );
}
