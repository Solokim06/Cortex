"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Sparkles,
  Send,
  Loader2,
  BookOpen,
  AlertTriangle,
  FileWarning,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { cortexFetch } from "@/lib/cortex";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type CitedDoc = {
  id: string;
  title: string;
  category: string;
};

type HelpResponse = {
  answer: string;
  cited_docs: CitedDoc[];
  suggested_docs: CitedDoc[];
  escalate: boolean;
  escalate_reason: string | null;
};

type Message =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      cited: CitedDoc[];
      suggested: CitedDoc[];
      escalate: boolean;
      escalateReason: string | null;
      error?: string;
    };

type Props = {
  onEscalate: (payload: {
    category?: string;
    subject?: string;
    description?: string;
    context?: Record<string, unknown>;
  }) => void;
};

export function HelpAssistant({ onEscalate }: Props) {
  const t = useTranslations("help.assistant");
  const locale = useLocale();
  const pathname = usePathname();
  const { getToken } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Listen for `cortex:help:ask` events — QuickTopics dispatches these
  // to prefill a question about a specific doc.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { docId: string };
      if (!detail?.docId) return;
      setInput(t("askAboutDoc", { docId: detail.docId }));
      textareaRef.current?.focus();
    };
    window.addEventListener("cortex:help:ask", handler);
    return () => window.removeEventListener("cortex:help:ask", handler);
  }, [t]);

  const submit = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await cortexFetch<HelpResponse>(
        "/help/ask",
        getToken,
        {
          method: "POST",
          body: {
            question,
            route: pathname,
          },
          locale,
        },
      );

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        cited: data.cited_docs ?? [],
        suggested: data.suggested_docs ?? [],
        escalate: !!data.escalate,
        escalateReason: data.escalate_reason ?? null,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: unknown) {
      const errorMsg: Message = {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: t("errorAnswer"),
        cited: [],
        suggested: [],
        escalate: true,
        escalateReason: null,
        error: e instanceof Error ? e.message : t("unknownError"),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, getToken, locale, pathname, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const isEmpty = messages.length === 0;
  const canSend = !loading && input.trim().length > 0;

  return (
    <div className="rounded-xl border border-border bg-card/40 flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0">
        <div className="rounded-md bg-primary/10 p-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-[11px] text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="inline-flex rounded-full bg-primary/10 p-3 mb-3">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium mb-1">
                {t("emptyHeadline")}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("emptySubtitle")}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onEscalate={onEscalate}
              />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                {t("thinking")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/60 shrink-0">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 focus-within:border-primary/40 transition-colors">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("inputPlaceholder")}
            rows={1}
            disabled={loading}
            className="flex-1 min-h-[36px] max-h-[200px] resize-none border-0 bg-transparent p-1.5 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          />
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={!canSend}
            className="h-8 w-8 shrink-0 mb-0.5"
            aria-label={t("sendAria")}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
          {t("footerHint")}
        </p>
      </div>
    </div>
  );
}

// ---------- Message bubble ----------

function MessageBubble({
  message,
  onEscalate,
}: {
  message: Message;
  onEscalate: Props["onEscalate"];
}) {
  const t = useTranslations("help.assistant");
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-bl-md border border-border bg-card/60 px-3.5 py-2.5 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* Citations */}
        {message.cited.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.cited.map((doc) => (
              <CitationChip key={doc.id} doc={doc} tone="primary" />
            ))}
          </div>
        )}

        {/* Suggested */}
        {message.suggested.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("relatedTopics")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {message.suggested.map((doc) => (
                <CitationChip key={doc.id} doc={doc} tone="muted" />
              ))}
            </div>
          </div>
        )}

        {/* Escalate */}
        {message.escalate && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-amber-700 dark:text-amber-300 leading-relaxed">
                {message.escalateReason || t("escalateDefault")}
              </p>
              <button
                type="button"
                onClick={() =>
                  onEscalate({
                    category: "question",
                    subject: t("escalateSubject"),
                    description: message.content,
                    context: {
                      last_question: "",
                      last_answer: message.content,
                      route: typeof window !== "undefined"
                        ? window.location.pathname
                        : "",
                    },
                  })
                }
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                <FileWarning className="w-3 h-3" />
                {t("fileTicket")}
              </button>
            </div>
          </div>
        )}

        {message.error && (
          <p className="mt-1.5 text-[10px] text-destructive/80">{message.error}</p>
        )}
      </div>
    </div>
  );
}

function CitationChip({
  doc,
  tone,
}: {
  doc: CitedDoc;
  tone: "primary" | "muted";
}) {
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
