"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { cortexFetch } from "@/lib/cortex";
import { BriefingCard } from "./BriefingCard";

type Lesson = {
  id: string;
  kind: string;
  title: string | null;
  content: string;
  meta: Record<string, unknown>;
  decision_id: string | null;
  created_at: string;
};

export function LatestLesson() {
  const t = useTranslations("home.latestLesson");
  const { getToken } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["lessons-home"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; lessons: Lesson[] }>(
        "/reflection/lessons?limit=1",
        () => Promise.resolve(token),
      );
    },
  });

  const lesson = data?.lessons?.[0];

  return (
    <BriefingCard
      icon={Lightbulb}
      title={t("title")}
      subtitle={lesson?.title || undefined}
      href="/reflections"
      linkLabel={t("allReflections")}
      loading={isLoading}
      empty={t("empty")}
      className="md:col-span-2"
    >
      {lesson && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/90 leading-relaxed">
            {lesson.content}
          </p>
          {typeof lesson.meta?.why_it_matters === "string" &&
            lesson.meta.why_it_matters && (
              <p className="text-[10px] text-muted-foreground italic">
                {t("whyItMatters", { reason: lesson.meta.why_it_matters })}
              </p>
            )}
        </div>
      )}
    </BriefingCard>
  );
}
