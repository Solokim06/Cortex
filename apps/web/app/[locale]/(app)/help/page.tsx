"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LifeBuoy, FileWarning, Sparkles } from "lucide-react";
import { AskPanel } from "@/components/help/AskPanel";
import { TopicGrid } from "@/components/help/TopicGrid";
import { FeedbackDialog } from "@/components/help/FeedbackDialog";
import { YourTickets } from "@/components/help/YourTickets";
import { TicketDrawer } from "@/components/help/TicketDrawer";
import { HelpDocDrawer } from "@/components/help/HelpDocDrawer";

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpPageInner />
    </Suspense>
  );
}

function HelpPageInner() {
  const t = useTranslations("help.hero");
  const searchParams = useSearchParams();

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [prefill, setPrefill] = useState<{
    category?: string;
    subject?: string;
    description?: string;
    context?: Record<string, unknown>;
  } | null>(null);

  // Drawer state — lifted here so both YourTickets and future entry points
  // (e.g. clicking a ticket ID in an email link) can open it.
  // If a ?ticket=<id> is in the URL, we open that drawer on first paint.
  // We keep a local override in state so that clicking other tickets from
  // the list can change the open drawer without touching the URL.
  const urlTicketId = searchParams.get("ticket");
  const [openTicketOverride, setOpenTicketOverride] = useState<string | null>(null);
  const openTicketId = openTicketOverride ?? urlTicketId;
  const setOpenTicketId = setOpenTicketOverride;

  const openFeedback = (payload?: typeof prefill) => {
    setPrefill(payload ?? null);
    setFeedbackOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* ============================================================ */}
      {/* Hero                                                         */}
      {/* ============================================================ */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-linear-to-br from-primary/6 via-card/40 to-card/40 px-6 sm:px-8 py-8">
        {/* Decorative gradient blob */}
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

          <button
            type="button"
            onClick={() => openFeedback()}
            className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3.5 py-2 text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <FileWarning className="w-3.5 h-3.5" />
            {t("sendFeedback")}
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* Ask panel + topics sidebar                                   */}
      {/* ============================================================ */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <AskPanel onEscalate={openFeedback} />
        <aside className="space-y-4">
          <TopicGrid />
        </aside>
      </div>

      {/* ============================================================ */}
      {/* User's own tickets                                           */}
      {/* ============================================================ */}
      <YourTickets onOpenTicket={(id) => setOpenTicketId(id)} />

      {/* ============================================================ */}
      {/* Dialog + drawers                                             */}
      {/* ============================================================ */}
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        initial={prefill ?? undefined}
      />

      <TicketDrawer
        ticketId={openTicketId}
        onClose={() => setOpenTicketId(null)}
      />

      <HelpDocDrawer />

      {/* Footer hint */}
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
