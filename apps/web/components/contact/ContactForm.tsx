"use client";

import { useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import {
  Loader2,
  Check,
  AlertCircle,
  Bug,
  Sparkles,
  HelpCircle,
  FileText,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  submitContact,
  ContactError,
  type ContactCategory,
  type ContactResponse,
} from "@/lib/contact";

const CATEGORIES: {
  value: ContactCategory;
  label: string;
  Icon: typeof Bug;
  sla: string;
}[] = [
  { value: "bug", label: "Bug report", Icon: Bug, sla: "4 hours" },
  { value: "feature", label: "Feature request", Icon: Sparkles, sla: "3 days" },
  { value: "question", label: "Question", Icon: HelpCircle, sla: "24 hours" },
  { value: "other", label: "Something else", Icon: FileText, sla: "3 days" },
];

export function ContactForm() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const [category, setCategory] = useState<ContactCategory>("question");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot — must remain empty. Bots fill every field they can see.
  const [website, setWebsite] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"rate" | "validation" | "network" | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [result, setResult] = useState<ContactResponse | null>(null);

  // Pre-fill email when signed in
  const effectiveEmail = isSignedIn
    ? user?.primaryEmailAddress?.emailAddress ?? email
    : email;

  const selectedCategory = CATEGORIES.find((c) => c.value === category)!;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Client-side sanity — server enforces these too
    if (subject.trim().length < 3) {
      setError("Please add a subject.");
      setErrorKind("validation");
      return;
    }
    if (description.trim().length < 3) {
      setError("Please add a message.");
      setErrorKind("validation");
      return;
    }

    setSubmitting(true);
    setError(null);
    setErrorKind(null);
    setRetryAfter(null);

    try {
      const token = isSignedIn ? await getToken() : null;
      const response = await submitContact(
        {
          category,
          subject: subject.trim(),
          description: description.trim(),
          contact_email:
            !isSignedIn && effectiveEmail.trim()
              ? effectiveEmail.trim()
              : undefined,
          website, // honeypot
        },
        token,
      );
      setResult(response);
    } catch (e) {
      if (e instanceof ContactError) {
        if (e.status === 429) {
          setError(
            e.detail ||
              "Too many messages from this address. Please try again later.",
          );
          setErrorKind("rate");
          setRetryAfter(e.retryAfterSeconds ?? null);
        } else {
          setError(e.detail || "Something went wrong. Please try again.");
          setErrorKind("validation");
        }
      } else {
        setError("Network error. Please try again.");
        setErrorKind("network");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // Success state
  // ============================================================
  if (result) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10">
            <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Message received
            </h2>
            <p className="text-[12px] text-muted-foreground">
              Thanks — we read every one.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 mb-5 font-mono text-[11px] text-muted-foreground">
          <span className="text-muted-foreground">Ticket</span>{" "}
          <span className="text-foreground/90">#{result.id.slice(0, 8)}</span>
        </div>

        <p className="text-[13px] text-muted-foreground leading-relaxed mb-1">
          {selectedCategory.label} · expected response within{" "}
          <span className="text-foreground/90 font-medium">
            {selectedCategory.sla}
          </span>
        </p>

        {!isSignedIn && effectiveEmail && (
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
            We&apos;ll reach out to <span className="text-foreground/90">{effectiveEmail}</span> if
            we need more information.
          </p>
        )}

        {isSignedIn && (
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
            You can view this ticket in{" "}
            <Link href="/support" className="text-primary hover:underline">
              Support → Your tickets
            </Link>
            .
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border/70 bg-card/40 px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>
          <Link
            href="/support"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border/70 bg-card/40 px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Try the AI assistant
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // ============================================================
  // Form state
  // ============================================================
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border/60 bg-card/40 p-6 sm:p-7 space-y-5"
    >
      {/* Category selector */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          What kind of message?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map(({ value, label, Icon }) => {
            const active = category === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] transition-colors text-left",
                  active
                    ? "border-primary/40 bg-primary/8 text-foreground"
                    : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border",
                )}
                aria-pressed={active}
              >
                <Icon
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label
          htmlFor="subject"
          className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-2"
        >
          Subject
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder="One-line summary"
          className="w-full rounded-md border border-border/70 bg-background/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Email — only shown when not signed in */}
      {isLoaded && !isSignedIn && (
        <div>
          <label
            htmlFor="email"
            className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-2"
          >
            Email{" "}
            <span className="normal-case tracking-normal text-muted-foreground">
              (optional — leave blank for a one-way message)
            </span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            placeholder="you@example.com"
            className="w-full rounded-md border border-border/70 bg-background/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      )}

      {/* Message */}
      <div>
        <label
          htmlFor="description"
          className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-2"
        >
          Message
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          rows={7}
          placeholder="Tell us what's going on. Steps to reproduce for bugs, use case for features, or your question."
          className="w-full rounded-md border border-border/70 bg-background/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-y"
        />
        <p className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
          {description.length} / 5000
        </p>
      </div>

      {/* Honeypot — invisible to humans, tempting to bots */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-10000px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label htmlFor="website">Website</label>
        <input
          id="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2.5 text-[12px] leading-relaxed",
            errorKind === "rate"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p>{error}</p>
            {errorKind === "rate" && retryAfter && (
              <p className="text-[11px] opacity-80 mt-1">
                Try again in{" "}
                {Math.ceil(retryAfter / 60)} minute
                {Math.ceil(retryAfter / 60) === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {isSignedIn
            ? "This will be attached to your account."
            : "No account needed. We don't track you."}
        </p>
        <Button
          type="submit"
          disabled={submitting}
          className="text-[13px] h-9"
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              Send message
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
