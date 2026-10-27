"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { BookOpen, Loader2 } from "lucide-react";
import { cortexFetch } from "@/lib/cortex";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type DocDetail = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  body: string;
  related: string[];
};

type DrawerState =
  | { status: "idle" }
  | { status: "loading"; docId: string }
  | { status: "loaded"; docId: string; doc: DocDetail }
  | { status: "error"; docId: string };

export function HelpDocDrawer({ isPublic = false }: { isPublic?: boolean } = {}) {
  const t = useTranslations("help.doc");
  const { getToken } = useAuth();

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DrawerState>({ status: "idle" });

  // Listen for `cortex:help:open-doc` events from citation chips / QuickTopics
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { docId?: string };
      if (!detail?.docId) return;
      setState({ status: "loading", docId: detail.docId });
      setOpen(true);
    };
    window.addEventListener("cortex:help:open-doc", handler);
    return () => window.removeEventListener("cortex:help:open-doc", handler);
  }, []);

  // Fetch when state transitions to "loading". All setState calls happen
  // inside async callbacks — never synchronously in the effect body.
  const docId =
    state.status === "loading" ? state.docId : undefined;

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;

    (async () => {
      try {
        const path = isPublic
          ? `/public/help/docs/${encodeURIComponent(docId)}`
          : `/help/docs/${encodeURIComponent(docId)}`;
        const doc = await cortexFetch<DocDetail>(
          path,
          isPublic ? async () => null : getToken,
        );
        if (!cancelled) {
          setState({ status: "loaded", docId, doc });
        }
      } catch {
        if (!cancelled) {
          setState({ status: "error", docId });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId, getToken, isPublic]);

  const doc = state.status === "loaded" ? state.doc : null;
  const loading = state.status === "loading";
  const notFound = state.status === "error";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-3.5 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/10 p-1.5">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
            </div>
            <SheetTitle className="text-base font-medium truncate">
              {doc?.title || t("loading")}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("loading")}
            </div>
          ) : notFound || !doc ? (
            <p className="text-sm text-muted-foreground">{t("notFound")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 mb-4">
                <span className="text-[10px] uppercase tracking-wider rounded-full border border-border bg-accent/30 px-2 py-0.5 text-muted-foreground">
                  {doc.category}
                </span>
                {doc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] rounded-full border border-border bg-accent/20 px-2 py-0.5 text-muted-foreground"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {doc.body}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
