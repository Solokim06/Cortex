"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Send,
  Loader2,
  AlertTriangle,
  FileWarning,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CitationChip } from "./CitationChip";
import { ExamplePrompts } from "./ExamplePrompts";
import { Markdown } from "@/components/chat/Markdown";
import {
  useAskFeedback,
  useAskStream,
  type CitedDoc,
} from "@/lib/hooks/use-help";

type Message =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      suggested: CitedDoc[];
      cited: CitedDoc[];
      escalate: boolean;
      escalateReason: string | null;
      streaming: boolean;
      error?: string;
      rating?: "up" | "down";
      rateLimited?: { retryAfterSeconds: number };
    };

type Props = {
  onEscalate: (payload: {
    category?: string;
    subject?: string;
    description?: string;
    context?: Record<string, unknown>;
  }) => void;
  /**
   * When true, the panel routes its ask requests to /public/help/ask/*
   * instead of the auth-required /help/ask/*. Used on the anonymous
   * support page.
   */
  isPublic?: boolean;
};

export function AskPanel({ onEscalate, isPublic = false }: Props) {
  const t = useTranslations("help.assistant");
  const pathname = usePathname();

  const { start, stop, isStreaming } = useAskStream({ isPublic });
  const feedback = useAskFeedback();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // ---- submit ----
  const submit = useCallback(
    async (overrideQuestion?: string) => {
      const question = (overrideQuestion ?? input).trim();
      if (!question || isStreaming) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: question,
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        suggested: [],
        cited: [],
        escalate: false,
        escalateReason: null,
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");

      const update = (
        patch: Partial<Extract<Message, { role: "assistant" }>>,
      ) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.role === "assistant"
              ? { ...m, ...patch }
              : m,
          ),
        );
      };

      const appendToken = (text: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.role === "assistant"
              ? { ...m, content: m.content + text }
              : m,
          ),
        );
      };

      await start(
        { question, route: pathname },
        {
          onMeta: (suggested) => update({ suggested }),
          onToken: (text) => appendToken(text),
          onCitations: (cited) => update({ cited }),
          onEscalate: (reason) =>
            update({ escalate: true, escalateReason: reason }),
          onError: (message) => {
            const match = message.match(
              /^RATE_LIMIT:retry_after=(\d+)$/,
            );
            if (match) {
              update({
                streaming: false,
                rateLimited: {
                  retryAfterSeconds: parseInt(match[1], 10),
                },
              });
              return;
            }
            update({
              error: message,
              content:
                "I couldn't complete that answer. Try again, or file a ticket below.",
              escalate: true,
            });
          },
          onDone: () => update({ streaming: false }),
        },
      );
    },
    [input, isStreaming, start, pathname],
  );

  // ---- cross-component events ----
  useEffect(() => {
    const prefill = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        docId?: string;
        question?: string;
      };
      if (detail.question) {
        setInput(detail.question);
      } else if (detail.docId) {
        setInput(t("askAboutDoc", { docId: detail.docId }));
      }
      textareaRef.current?.focus();
    };
    const askNow = (e: Event) => {
      const detail = (e as CustomEvent).detail as { question?: string };
      if (detail.question) {
        void submit(detail.question);
      }
    };
    window.addEventListener("cortex:help:ask", prefill);
    window.addEventListener("cortex:help:ask-now", askNow);
    return () => {
      window.removeEventListener("cortex:help:ask", prefill);
      window.removeEventListener("cortex:help:ask-now", askNow);
    };
  }, [t, submit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const onRate = (messageId: string, rating: "up" | "down") => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const msg = messages[idx];
    if (msg.role !== "assistant") return;
    const userQuestion =
      [...messages.slice(0, idx)].reverse().find((m) => m.role === "user")
        ?.content ?? "";

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.role === "assistant"
          ? { ...m, rating }
          : m,
      ),
    );

    feedback.mutate({
      question: userQuestion,
      answer: msg.content,
      rating,
      cited_doc_ids: msg.cited.map((c) => c.id),
    });
  };

  const isEmpty = messages.length === 0;
  const canSend = !isStreaming && input.trim().length > 0;

  return (
    <div className="rounded-xl border border-border bg-card/40 flex flex-col h-160">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0">
        <div className="rounded-md bg-primary/10 p-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {isStreaming && (
          <button
            type="button"
            onClick={stop}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("stop")}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center gap-5 px-4">
            <div className="text-center max-w-md">
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
            <ExamplePrompts onPick={(q) => void submit(q)} />
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onEscalate={onEscalate}
                onRate={onRate}
              />
            ))}
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
            disabled={isStreaming}
            className="flex-1 min-h-9 max-h-50 resize-none border-0 bg-transparent p-1.5 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void submit()}
            disabled={!canSend}
            className="h-8 w-8 shrink-0 mb-0.5"
            aria-label={t("sendAria")}
          >
            {isStreaming ? (
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

// =====================================================================
// message bubble
// =====================================================================

function MessageBubble({
  message,
  onEscalate,
  onRate,
}: {
  message: Message;
  onEscalate: Props["onEscalate"];
  onRate: (id: string, rating: "up" | "down") => void;
}) {
  const t = useTranslations("help.assistant");

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap wrap-break-word">
          {message.content}
        </div>
      </div>
    );
  }

  const showCaret = message.streaming && message.content.length > 0;
  const showThinking = message.streaming && message.content.length === 0;

  return (
    <div className="flex gap-2.5">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        {message.rateLimited ? (
          <RateLimitCard
            retryAfterSeconds={message.rateLimited.retryAfterSeconds}
          />
        ) : (
          <div className="rounded-2xl rounded-bl-md border border-border bg-card/60 px-3.5 py-2.5 text-sm text-foreground/90 leading-relaxed">
            {showThinking ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                {t("thinking")}
              </span>
            ) : (
              <>
                <Markdown content={message.content} />
                {showCaret && (
                  <span className="inline-block w-1.5 h-4 align-text-bottom ml-0.5 bg-primary/60 animate-pulse" />
                )}
              </>
            )}
          </div>
        )}

        {!message.rateLimited && message.cited.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.cited.map((doc) => (
              <CitationChip key={doc.id} doc={doc} tone="primary" />
            ))}
          </div>
        )}

        {!message.rateLimited &&
          !message.streaming &&
          message.suggested.length > 0 && (
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

        {!message.rateLimited &&
          !message.streaming &&
          !message.error &&
          message.content && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {message.rating ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  {message.rating === "up" ? (
                    <ThumbsUp className="w-3 h-3" />
                  ) : (
                    <ThumbsDown className="w-3 h-3" />
                  )}
                  {t("thanksFeedback")}
                </span>
              ) : (
                <>
                  <span className="opacity-70">{t("wasHelpful")}</span>
                  <button
                    type="button"
                    onClick={() => onRate(message.id, "up")}
                    className="rounded p-1 hover:bg-accent/50 hover:text-foreground transition-colors"
                    aria-label="Helpful"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRate(message.id, "down")}
                    className="rounded p-1 hover:bg-accent/50 hover:text-rose-500 transition-colors"
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          )}

        {!message.rateLimited && !message.streaming && message.escalate && (
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
                      last_answer: message.content,
                      route:
                        typeof window !== "undefined"
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

        {!message.rateLimited && message.error && (
          <p className="mt-1.5 text-[10px] text-destructive/80">
            {message.error}
          </p>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// rate limit card
// =====================================================================

function RateLimitCard({ retryAfterSeconds }: { retryAfterSeconds: number }) {
  const t = useTranslations("help.assistant");
  const [remaining, setRemaining] = useState(retryAfterSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const ready = remaining <= 0;

  return (
    <div className="rounded-2xl rounded-bl-md border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
        {t("rateLimitedHeadline")}
      </p>
      <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
        {ready
          ? t("rateLimitReady")
          : t("rateLimitCountdown", { seconds: remaining })}
      </p>
    </div>
  );
}
