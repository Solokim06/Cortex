"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { BookOpen, ChevronRight, Loader2 } from "lucide-react";
import { cortexFetch } from "@/lib/cortex";

type CategoryItem = {
  category: string;
  count: number;
};

type DocItem = {
  id: string;
  title: string;
  category: string;
};

export function QuickTopics() {
  const t = useTranslations("help.topics");
  const { getToken } = useAuth();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await cortexFetch<CategoryItem[]>(
          "/help/topics",
          getToken,
        );
        if (!cancelled) setCategories(data);
      } catch {
        // silent — QuickTopics is a nice-to-have
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const openCategory = async (category: string) => {
    if (activeCategory === category) {
      setActiveCategory(null);
      setDocs([]);
      return;
    }
    setActiveCategory(category);
    setLoadingDocs(true);
    try {
      const data = await cortexFetch<DocItem[]>(
        `/help/topics/${encodeURIComponent(category)}`,
        getToken,
      );
      setDocs(data);
    } catch {
      setDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  const openDoc = (docId: string) => {
    window.dispatchEvent(
      new CustomEvent("cortex:help:open-doc", { detail: { docId } }),
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-md bg-primary/10 p-1.5">
          <BookOpen className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-sm font-medium">{t("title")}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("loading")}
        </div>
      ) : categories.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-0.5">
          {categories.map((c) => {
            const isActive = activeCategory === c.category;
            return (
              <li key={c.category}>
                <button
                  type="button"
                  onClick={() => openCategory(c.category)}
                  className={
                    "w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors " +
                    (isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40")
                  }
                >
                  <span className="flex-1 truncate">{c.category}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] tabular-nums opacity-70">
                      {c.count}
                    </span>
                    <ChevronRight
                      className={
                        "w-3 h-3 transition-transform " +
                        (isActive ? "rotate-90" : "")
                      }
                    />
                  </span>
                </button>

                {isActive && (
                  <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
                    {loadingDocs ? (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        {t("loadingDocs")}
                      </div>
                    ) : (
                      docs.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => openDoc(d.id)}
                          className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground py-1 px-1 rounded transition-colors truncate"
                        >
                          {d.title}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
