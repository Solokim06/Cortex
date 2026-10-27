"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Markdown } from "@/components/chat/Markdown";
import { CitationChip } from "@/components/help/CitationChip";
import {
  useAskStream,
  type CitedDoc,
} from "@/lib/hooks/use-help";

// =====================================================================
// Rotation — ordered by wow factor
// =====================================================================
const QUESTIONS = [
  "How do I capture a page from my browser?",
  "Is my data private?",
  "How do I install the extension?",
];

// Timings (ms). Keep these readable — they define the rhythm.
const T_START = 1400;        // initial pause before the loop begins
const T_PER_CHAR = 28;       // typing speed
const T_BEFORE_SEND = 420;   // beat between finishing typing and sending
const T_HOLD_AFTER_DONE = 4200;
const T_FADE = 300;

// =====================================================================
// Component
// =====================================================================

type Phase = "idle" | "typing" | "asking" | "answering" | "done";

export function LiveAskDemo() {
  const { start, stop, isStreaming } = useAskStream({ isPublic: true });

  const [phase, setPhase] = useState<Phase>("idle");
  const [typedQuestion, setTypedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [cited, setCited] = useState<CitedDoc[]>([]);
  const [takeover, setTakeover] = useState(false);

  // Refs so the loop can read fresh values without re-running effects
  const loopRef = useRef<number>(0);          // rotation index
  const cancelledRef = useRef(false);
  const demoRunRef = useRef(0);               // increments to invalidate prior runs
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------
  const clearAll = () => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current.clear();
  };

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        timeoutsRef.current.delete(t);
        resolve();
      }, ms);
      timeoutsRef.current.add(t);
    });

  // ---------------------------------------------------------------
  // visible-tab awareness
  // ---------------------------------------------------------------
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    const onVis = () =>
      setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ---------------------------------------------------------------
  // reduced motion
  // ---------------------------------------------------------------
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------
  // the loop
  // ---------------------------------------------------------------
  useEffect(() => {
    if (takeover) return;
    if (!isVisible) return;

    cancelledRef.current = false;
    const runId = ++demoRunRef.current;

    const runOnce = async () => {
      const question = QUESTIONS[loopRef.current % QUESTIONS.length];
      loopRef.current += 1;

      // ---- 1. reset state ----
      if (cancelledRef.current || runId !== demoRunRef.current) return;
      setPhase("typing");
      setAnswer("");
      setCited([]);
      setTypedQuestion("");

      // ---- 2. type it ----
      if (prefersReduced) {
        setTypedQuestion(question);
      } else {
        for (let i = 1; i <= question.length; i++) {
          if (cancelledRef.current || runId !== demoRunRef.current) return;
          setTypedQuestion(question.slice(0, i));
           
          await wait(T_PER_CHAR);
        }
      }

      if (cancelledRef.current || runId !== demoRunRef.current) return;
      await wait(T_BEFORE_SEND);
      if (cancelledRef.current || runId !== demoRunRef.current) return;

      // ---- 3. stream the answer ----
      setPhase("asking");
      let buffer = "";
      await new Promise<void>((resolve) => {
        start(
          { question, route: "/" },
          {
            onToken: (text) => {
              if (cancelledRef.current || runId !== demoRunRef.current) return;
              buffer += text;
              setAnswer(buffer);
              if (buffer.length > 0) setPhase("answering");
            },
            onCitations: (docs) => {
              if (cancelledRef.current || runId !== demoRunRef.current) return;
              setCited(docs);
            },
            onDone: () => resolve(),
            onError: () => resolve(),
          },
        );
      });

      if (cancelledRef.current || runId !== demoRunRef.current) return;
      setPhase("done");

      // ---- 4. hold ----
      await wait(T_HOLD_AFTER_DONE);
      if (cancelledRef.current || runId !== demoRunRef.current) return;

      // ---- 5. fade + advance ----
      setPhase("idle");
      await wait(T_FADE);
      if (cancelledRef.current || runId !== demoRunRef.current) return;

      // loop
       
      void runOnce();
    };

    // Kick off after the initial pause
    void (async () => {
      await wait(T_START);
      if (cancelledRef.current || runId !== demoRunRef.current) return;
      void runOnce();
    })();

    return () => {
      cancelledRef.current = true;
      clearAll();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeover, isVisible]);

  // ---------------------------------------------------------------
  // takeover — user clicked the input
  // ---------------------------------------------------------------
  const handleTakeover = () => {
    if (takeover) return;
    cancelledRef.current = true;
    clearAll();
    stop();
    setTakeover(true);
    setTypedQuestion("");
    setAnswer("");
    setCited([]);
    setPhase("idle");
  };

  // ---------------------------------------------------------------
  // manual ask (after takeover)
  // ---------------------------------------------------------------
  const [manualQ, setManualQ] = useState("");
  const submitManual = async () => {
    const q = manualQ.trim();
    if (!q || isStreaming) return;
    setManualQ("");
    setAnswer("");
    setCited([]);
    setPhase("asking");
    let buffer = "";
    await new Promise<void>((resolve) => {
      start(
        { question: q, route: "/" },
        {
          onToken: (text) => {
            buffer += text;
            setAnswer(buffer);
            setPhase("answering");
          },
          onCitations: (docs) => setCited(docs),
          onDone: () => resolve(),
          onError: () => resolve(),
        },
      );
    });
    setPhase("done");
  };

  // ---------------------------------------------------------------
  // render
  // ---------------------------------------------------------------
  const isFadingOut = phase === "idle" && !!answer;

  return (
    <div
      className="relative w-full max-w-md mx-auto lg:mx-0 rounded-2xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden shadow-2xl shadow-primary/5 transition-opacity duration-300"
      style={{ opacity: isFadingOut ? 0.15 : 1 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="rounded-md bg-primary/10 p-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Ask Cortex</p>
          <p className="text-[10px] text-muted-foreground">
            {takeover ? "Anonymous · live" : "Live demo · try it"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          live
        </span>
      </div>

      {/* Body */}
      <div className="relative px-4 py-4 h-[340px] overflow-hidden flex flex-col gap-3">
        {/* fade at the bottom so long answers don't spill visually */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card/60 to-transparent"
          aria-hidden
        />
        {/* question bubble */}
        {(typedQuestion || takeover) && (
          <div className="flex justify-end">
            {takeover ? (
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary/15 px-3 py-1.5 text-xs text-foreground/90">
                {answer ? "— your question —" : ""}
              </div>
            ) : (
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3 py-1.5 text-xs">
                {typedQuestion}
                {phase === "typing" && (
                  <span className="inline-block w-0.5 h-3 align-text-bottom ml-0.5 bg-primary-foreground/70 animate-pulse" />
                )}
              </div>
            )}
          </div>
        )}

        {/* answer bubble */}
        {answer && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary" />
            </div>
            <div className="min-w-0 flex-1 text-xs text-foreground/85 leading-relaxed">
              <Markdown content={answer} />
              {phase === "answering" && (
                <span className="inline-block w-1 h-3 align-text-bottom ml-0.5 bg-primary/60 animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* thinking */}
        {phase === "asking" && !answer && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-3 h-3 text-primary animate-spin" />
            </div>
            <span className="text-xs text-muted-foreground self-center">
              Thinking…
            </span>
          </div>
        )}

        {/* citations */}
        {cited.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {cited.map((doc) => (
              <CitationChip key={doc.id} doc={doc} tone="primary" />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 pb-3">
        <div
          className="flex items-end gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 focus-within:border-primary/40 transition-colors"
          onClick={handleTakeover}
        >
          <input
            type="text"
            aria-label="Ask Cortex demo question"
            value={takeover ? manualQ : typedQuestion}
            onChange={(e) => takeover && setManualQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && takeover) {
                e.preventDefault();
                void submitManual();
              }
            }}
            readOnly={!takeover}
            placeholder={takeover ? "Ask anything…" : ""}
            className="flex-1 bg-transparent text-xs p-1.5 outline-none placeholder:text-muted-foreground cursor-text"
          />
          <button
            type="button"
            onClick={takeover ? submitManual : handleTakeover}
            disabled={isStreaming || (takeover && !manualQ.trim())}
            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            aria-label="Send"
          >
            {isStreaming ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground text-center">
          {takeover
            ? "Answers from Cortex docs. Not stored."
            : "Auto-playing demo — click to ask your own."}
        </p>
      </div>
    </div>
  );
}
