"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  title: string;
  /** Optional subtitle shown under the title */
  subtitle?: string;
  /** Content rendered inside the card */
  children: React.ReactNode;
  /** Optional link — makes the whole card clickable and shows an arrow */
  href?: string;
  /** Optional label for the link (defaults to a localized "View all") */
  linkLabel?: string;
  /** Optional custom className for outer container */
  className?: string;
  /** Empty state message — rendered when children is null/undefined */
  empty?: string;
  /** Loading state */
  loading?: boolean;
};

export function BriefingCard({
  icon: Icon,
  title,
  subtitle,
  children,
  href,
  linkLabel,
  className,
  empty,
  loading = false,
}: Props) {
  const t = useTranslations("home.briefingCard");
  const resolvedLinkLabel = linkLabel ?? t("viewAll");
  const resolvedEmpty = empty ?? t("nothingHereYet");

  const hasContent =
    children !== null &&
    children !== undefined &&
    children !== false;

  const body = (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/40 p-4 transition-colors",
        href && "hover:border-primary/40 hover:bg-card/60 cursor-pointer",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate">{title}</h3>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {href && (
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </div>

      {/* Body */}
      <div className="text-sm">
        {loading ? (
          <LoadingRows />
        ) : hasContent ? (
          children
        ) : (
          <p className="text-xs text-muted-foreground">{resolvedEmpty}</p>
        )}
      </div>

      {/* Footer link text */}
      {href && !loading && (
        <div className="mt-3 pt-3 border-t border-border/60">
          <span className="text-[10px] text-muted-foreground">
            {resolvedLinkLabel}
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }

  return body;
}

/**
 * Skeleton rows shown when the card is loading.
 */
function LoadingRows() {
  return (
    <div className="space-y-2">
      <div className="h-3 bg-accent/40 rounded w-3/4 animate-pulse" />
      <div className="h-3 bg-accent/40 rounded w-1/2 animate-pulse" />
    </div>
  );
}
