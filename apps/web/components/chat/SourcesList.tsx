"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Brain,
  FileText,
  Lightbulb,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import type { MessageSource } from "./MessageBubble";

type Props = {
  sources: MessageSource[];
  nodesUsed: number;
};

function getSourceIcon(type: string) {
  switch (type) {
    case "thought":
      return FileText;
    case "concept":
      return Brain;
    case "reflection":
      return Lightbulb;
    case "decision":
      return GitBranch;
    case "source":
      return BookOpen;
    default:
      return Layers;
  }
}

export function SourcesList({ sources, nodesUsed }: Props) {
  const t = useTranslations("chat.sourcesList");
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/60">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((v) => !v)}
        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 mr-1" />
        ) : (
          <ChevronRight className="w-3 h-3 mr-1" />
        )}
        <span>
          {t("sourceCount", { count: nodesUsed })}
        </span>
      </Button>

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.map((source) => {
            const Icon = getSourceIcon(source.type);
            return (
              <Badge
                key={source.id}
                variant="outline"
                className="text-[10px] gap-1 max-w-[240px] truncate cursor-pointer hover:border-primary/40 hover:bg-accent/40 transition-colors"
              >
                <Icon className="w-3 h-3 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {source.title || t("untitled")}
                </span>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
