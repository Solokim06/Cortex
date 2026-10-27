"use client";

import { useTranslations } from "next-intl";
import {
  Sparkles,
  Upload,
  Brain,
  MessageSquare,
  Puzzle,
  GitBranch,
  ArrowRight,
} from "lucide-react";
import { cn } from "cn";

type Prompt = {
  /** The exact text sent to the LLM when clicked. */
  question: string;
  /** Icon shown on the left of the chip. */
  icon: typeof Sparkles;
  /** i18n key under help.assistant.examples.* for the display label. */
  i18nKey: string;
  /** Optional accent tone */
  tone?: string;
};

/**
 * Curated starter questions. Kept short (≤8) and grouped visually so
 * the empty state doesn't feel like a wall of buttons.
 *
 * The `question` field is what actually gets sent — it can differ from
 * the display label to be more specific for the LLM without looking
 * weird to the user.
 */
const PROMPTS: Prompt[] = [
  {
    question: "How do I capture something from my browser?",
    icon: Puzzle,
    i18nKey: "capture",
    tone: "text-violet-500",
  },
  {
    question: "How do I install the browser extension?",
    icon: Upload,
    i18nKey: "installExtension",
    tone: "text-sky-500",
  },
  {
    question: "What is Memory and how does it work?",
    icon: Brain,
    i18nKey: "memory",
    tone: "text-emerald-500",
  },
  {
    question: "How do I use Cortex chat?",
    icon: MessageSquare,
    i18nKey: "chat",
    tone: "text-primary",
  },
  {
    question: "How do decisions work?",
    icon: GitBranch,
    i18nKey: "decisions",
    tone: "text-amber-500",
  },
  {
    question: "What are Reflections and when should I use them?",
    icon: Sparkles,
    i18nKey: "reflections",
    tone: "text-rose-500",
  },
];

type Props = {
  /** Called when a chip is picked. Parent handles sending the question. */
  onPick: (question: string) => void;
};

/**
 * Starter-prompt chips shown on the empty state of the Ask panel.
 *
 * Clicking a chip calls `onPick(question)` — the parent AskPanel
 * handles the actual submission. This keeps the component dumb.
 */
export function ExamplePrompts({ onPick }: Props) {
  const t = useTranslations("help.assistant.examples");

  return (
    <div className="w-full max-w-md">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground text-center mb-2.5">
        {t("title")}
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {PROMPTS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.i18nKey}
              type="button"
              onClick={() => onPick(p.question)}
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60",
                "px-2.5 py-1.5 text-[11px] text-muted-foreground",
                "hover:text-foreground hover:border-primary/40 hover:bg-primary/5",
                "transition-colors text-left",
              )}
            >
              <Icon className={cn("w-3 h-3 shrink-0", p.tone)} />
              <span>{t(p.i18nKey)}</span>
              <ArrowRight className="w-2.5 h-2.5 opacity-0 -ml-0.5 group-hover:opacity-60 group-hover:translate-x-0.5 transition-all" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Alternative export — pushes a question to the AskPanel via the
 * cortex:help:ask-now event. Use this when you don't have a direct
 * onPick handler available (e.g. from a different part of the page).
 */
export function dispatchExampleAsk(question: string) {
  window.dispatchEvent(
    new CustomEvent("cortex:help:ask-now", { detail: { question } }),
  );
}
