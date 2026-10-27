"use client";

import { Suspense } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { LifeBuoy, Sparkles, LogIn } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AskPanel } from "@/components/help/AskPanel";
import { TopicGrid } from "@/components/help/TopicGrid";
import { FeedbackDialog } from "@/components/help/FeedbackDialog";
import { YourTickets } from "@/components/help/YourTickets";
import { TicketDrawer } from "@/components/help/TicketDrawer";
import { HelpDocDrawer } from "@/components/help/HelpDocDrawer";
import { useState } from "react";

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportPageInner />
    </Suspense>
  );
}

function SupportPageInner() {
  const t = useTranslations("help.hero");
  const { isSignedIn } = useAuth();

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const openFeedback = () => setFeedbackOpen(true);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-linear-to-br from-primary/6 via-card/40 to-card/40 px-6 sm:px-8 py-8">
        <div
          className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 max-w-2xl">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="rounded-md bg-primary/15 p-1.5">
                <LifeBuoy className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[11px] uppercase tracking-wider text-primary/80 font-medium">
                Support
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          {isSignedIn ? (
            <button
              type="button"
              onClick={openFeedback}
              className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3.5 py-2 text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              {t("sendFeedback")}
            </button>
          ) : (
            <Link
              href="/sign-in"
              className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3.5 py-2 text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Ask panel + topics sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <AskPanel onEscalate={openFeedback} isPublic={!isSignedIn} />
        <aside className="space-y-4">
          <TopicGrid isPublic={!isSignedIn} />
        </aside>
      </div>

      {/* Tickets — only for signed-in */}
      {isSignedIn ? (
        <YourTickets onOpenTicket={(id) => setOpenTicketId(id)} />
      ) : (
        <div className="rounded-xl border border-border bg-card/40 px-6 py-8 text-center">
          <p className="text-sm font-medium">Track your support tickets</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in to file a ticket and follow up with our team.
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-xs font-medium hover:bg-accent transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in
          </Link>
        </div>
      )}

      {/* Dialogs / drawers */}
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
      />
      <TicketDrawer
        ticketId={openTicketId}
        onClose={() => setOpenTicketId(null)}
      />
      <HelpDocDrawer isPublic={!isSignedIn} />

      <footer className="flex items-center justify-center gap-1.5 pt-4 text-[11px] text-muted-foreground">
        <Sparkles className="w-3 h-3 text-primary/60" />
        <span>
          Answers come from Cortex&apos;s product docs. Your captures and
          personal data aren&apos;t used here.
        </span>
      </footer>
    </div>
  );
}
