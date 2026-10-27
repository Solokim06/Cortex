"use client";

import Link from "next/link";
import {
  Inbox,
  Brain,
  MessageSquare,
  Network,
  Sparkles,
  Shield,
  Server,
  BookOpen,
  Wand2,
  Layers,
  Activity,
  Mail,
  ArrowRight,
} from "lucide-react";
import {
  type ReleaseSection as ReleaseSectionType,
  TAG_STYLES,
  TAG_LABELS,
} from "@/lib/changelog";
import { cn } from "@/lib/utils";

const ICONS = {
  Inbox,
  Brain,
  MessageSquare,
  Network,
  Sparkles,
  Shield,
  Server,
  BookOpen,
  Wand2,
  Layers,
  Activity,
  Mail,
} as const;

export function ReleaseSection({ section }: { section: ReleaseSectionType }) {
  const Icon = ICONS[section.icon] ?? Sparkles;

  return (
    <div className="py-3">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-primary/80 shrink-0" />
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {section.title}
        </h4>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          · {section.items.length}
        </span>
      </div>

      <ul className="space-y-2 ml-[22px]">
        {section.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
            {/* Tag badge */}
            {item.tag && (
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-sm border px-1.5 py-0 mt-[2px] text-[9px] font-mono font-medium uppercase tracking-wider shrink-0 tabular-nums w-[62px]",
                  TAG_STYLES[item.tag],
                )}
              >
                {TAG_LABELS[item.tag]}
              </span>
            )}

            {/* Content */}
            <span className="min-w-0 flex-1 text-foreground/85">
              {item.text}
              {item.code && (
                <code className="ml-1.5 inline-block rounded border border-border/60 bg-card/60 px-1.5 py-0.5 text-[11px] text-primary/90 font-mono align-middle">
                  {item.code}
                </code>
              )}
              {item.href && (
                <Link
                  href={item.href}
                  className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                >
                  {item.linkText ?? "See more"}
                  <ArrowRight className="w-2.5 h-2.5" />
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
