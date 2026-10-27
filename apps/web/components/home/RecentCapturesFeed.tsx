"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Sparkles, FileText, Mic, Link2, Image as ImageIcon } from "lucide-react";
import { cortexFetch } from "@/lib/cortex";
import { BriefingCard } from "./BriefingCard";

type NodeItem = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  source_type?: string;
  created_at: string;
};

function pickIcon(sourceType: string | undefined, nodeType: string) {
  if (sourceType === "voice" || sourceType === "audio") return Mic;
  if (sourceType === "url") return Link2;
  if (sourceType === "image") return ImageIcon;
  if (sourceType === "file_pdf" || sourceType === "file_docx" || sourceType === "file_spreadsheet") {
    return FileText;
  }
  if (nodeType === "concept") return Sparkles;
  return Sparkles;
}

type TimeTranslator = (
  key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo",
  values?: Record<string, string | number>,
) => string;

function timeAgo(iso: string, t: TimeTranslator): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return t("justNow");
  if (diff < 3600) return t("minutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("hoursAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("daysAgo", { count: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString();
}

export function RecentCapturesFeed() {
  const t = useTranslations("home.recentCaptures");
  const { getToken } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["recent-captures-home"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; nodes: NodeItem[] }>(
        "/capture/?limit=5",
        () => Promise.resolve(token),
      );
    },
  });

  const nodes = data?.nodes ?? [];

  return (
    <BriefingCard
      icon={Sparkles}
      title={t("title")}
      subtitle={
        nodes.length > 0
          ? t("totalCount", { count: data?.count ?? nodes.length })
          : undefined
      }
      href="/capture"
      linkLabel={t("captureNew")}
      loading={isLoading}
      empty={t("empty")}
    >
      <ul className="space-y-2">
        {nodes.map((n) => {
          const Icon = pickIcon(n.source_type, n.type);
          return (
            <li key={n.id} className="flex items-start gap-2 min-w-0">
              <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">
                  {n.title || t("untitled")}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {timeAgo(n.created_at, t)}
                  {n.content ? ` · ${n.content.slice(0, 60)}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </BriefingCard>
  );
}
