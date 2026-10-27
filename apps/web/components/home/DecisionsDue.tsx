"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { GitBranch } from "lucide-react";
import { cortexFetch } from "@/lib/cortex";
import { BriefingCard } from "./BriefingCard";

type Decision = {
  id: string;
  question: string;
  status: string;
  chosen_option: string | null;
  review_at: string | null;
  created_at: string;
};

type TimeTranslator = (
  key: "dueToday" | "oneDayOverdue" | "daysOverdue",
  values?: Record<string, string | number>,
) => string;

function daysOverdue(iso: string, t: TimeTranslator): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 86400000);
  if (diff === 0) return t("dueToday");
  if (diff === 1) return t("oneDayOverdue");
  return t("daysOverdue", { count: diff });
}

export function DecisionsDue() {
  const t = useTranslations("home.decisionsDue");
  const { getToken } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["decisions-due-home"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; decisions: Decision[] }>(
        "/decision/due",
        () => Promise.resolve(token),
      );
    },
  });

  const decisions = data?.decisions ?? [];
  const count = data?.count ?? decisions.length;

  return (
    <BriefingCard
      icon={GitBranch}
      title={t("title")}
      subtitle={count > 0 ? t("subtitleCount", { count }) : undefined}
      href="/decisions"
      linkLabel={t("viewAll")}
      loading={isLoading}
      empty={t("empty")}
    >
      <ul className="space-y-2">
        {decisions.slice(0, 4).map((d) => (
          <li key={d.id} className="min-w-0">
            <p className="text-xs font-medium truncate">
              {d.question}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {d.review_at ? daysOverdue(d.review_at, t) : t("awaitingOutcome")}
            </p>
          </li>
        ))}
      </ul>
    </BriefingCard>
  );
}
