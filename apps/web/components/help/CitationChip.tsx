"use client";

import { useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { cn } from "cn";
import type { CitedDoc } from "@/lib/hooks/use-help";

type Props = {
  doc: CitedDoc;
  tone?: "primary" | "muted";
};

/**
 * A clickable chip representing a cited or suggested help doc.
 *
 * Clicking dispatches a `cortex:help:open-doc` window event, which the
 * global HelpDocDrawer listens for. This keeps the chip decoupled from
 * the drawer and works from anywhere on the page.
 */
export function CitationChip({ doc, tone = "muted" }: Props) {
  const t = useTranslations("help.assistant");

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent("cortex:help:open-doc", { detail: { docId: doc.id } }),
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
        tone === "primary"
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
          : "border-border bg-accent/30 text-muted-foreground hover:text-foreground hover:border-primary/40",
      )}
      title={t("openDoc")}
    >
      <BookOpen className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate max-w-[200px]">{doc.title}</span>
    </button>
  );
}

/**
 * Convenience: render a labelled list of citation chips.
 * Returns null if the list is empty — so callers can safely render it
 * without conditionals.
 */
export function CitationList({
  docs,
  tone = "muted",
  label,
  className,
}: {
  docs: CitedDoc[];
  tone?: "primary" | "muted";
  label?: string;
  className?: string;
}) {
  if (docs.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {label && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center mr-1">
          {label}
        </span>
      )}
      {docs.map((doc) => (
        <CitationChip key={doc.id} doc={doc} tone={tone} />
      ))}
    </div>
  );
}
