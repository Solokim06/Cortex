"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { cortexFetch } from "@/lib/cortex";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceTypeChip } from "./SourceTypeChip";

type NodeItem = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  created_at: string;
};

export function RecentCaptures() {
  const t = useTranslations("capture.recent");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["recent-nodes"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; nodes: NodeItem[] }>(
        "/capture/?limit=10",
        () => Promise.resolve(token),
      );
    },
  });

  // Refetch when a new capture is signaled
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["recent-nodes"] });
    };
    window.addEventListener("cortex:capture", handler);
    return () => window.removeEventListener("cortex:capture", handler);
  }, [queryClient]);

  if (isLoading) {
    return (
      <Card className="bg-card/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("loadFailed")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const nodes = data?.nodes ?? [];

  return (
    <Card className="bg-card/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-base font-medium">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          nodes.map((n) => (
            <div
              key={n.id}
              className="group flex items-start gap-3 rounded-md border border-transparent hover:border-border hover:bg-accent/30 px-3 py-2.5 transition-colors"
            >
              <div className="rounded-md bg-primary/10 p-1.5 mt-0.5 shrink-0">
                <SourceTypeChip type={n.type} iconOnly />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {n.title || t("untitled")}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {n.content || ""}
                </p>
              </div>
              <SourceTypeChip type={n.type} className="shrink-0" />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
