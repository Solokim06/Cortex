"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  MailX,
  ArrowLeft,
  LifeBuoy,
} from "lucide-react";
import { unsubscribeWithToken } from "@/lib/hooks/use-help";

type State =
  | { status: "loading" }
  | { status: "ok"; email: string }
  | { status: "error"; reason: string }
  | { status: "missing" };

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <UnsubscribeInner />
    </Suspense>
  );
}

function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (!token) {
    return <Shell state={{ status: "missing" }} />;
  }

  return <UnsubscribeWithToken token={token} />;
}

function UnsubscribeWithToken({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await unsubscribeWithToken(token);
        if (cancelled) return;
        if (result.ok && result.email) {
          setState({ status: "ok", email: result.email });
        } else {
          setState({
            status: "error",
            reason: result.reason ?? "invalid_token",
          });
        }
      } catch {
        if (!cancelled) {
          setState({ status: "error", reason: "network_error" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return <Shell state={state} />;
}

function Shell({ state }: { state: State }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-border bg-card/40 px-6 py-7 text-center">
          <div className="flex items-center justify-center gap-2 mb-5">
            <LifeBuoy className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight">
              Cortex
            </span>
          </div>

          {state.status === "loading" && (
            <>
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              <h1 className="text-base font-medium mb-1">Processing…</h1>
              <p className="text-xs text-muted-foreground">Just a moment.</p>
            </>
          )}

          {state.status === "ok" && (
            <>
              <div className="inline-flex rounded-full bg-emerald-500/10 p-3 mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <h1 className="text-base font-medium mb-1.5">
                You&apos;re unsubscribed
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed mb-1">
                We&apos;ll stop sending ticket emails to{" "}
                <span className="text-foreground font-medium">
                  {state.email}
                </span>
                .
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                You&apos;ll still see updates when you open the app. You can
                turn emails back on any time in settings.
              </p>

              <div className="mt-6 flex items-center justify-center gap-2">
                <Link
                  href="/help"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to Help
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Manage settings
                </Link>
              </div>
            </>
          )}

          {state.status === "error" && (
            <>
              <div className="inline-flex rounded-full bg-rose-500/10 p-3 mb-4">
                <XCircle className="w-6 h-6 text-rose-500" />
              </div>
              <h1 className="text-base font-medium mb-1.5">
                Something went wrong
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {state.reason === "invalid_token"
                  ? "This unsubscribe link is invalid or has expired."
                  : "We couldn't process your request. Try again in a moment."}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
                You can also manage your notification preferences from your
                account settings.
              </p>

              <div className="mt-6 flex items-center justify-center gap-2">
                <Link
                  href="/help"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to Help
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Open settings
                </Link>
              </div>
            </>
          )}

          {state.status === "missing" && (
            <>
              <div className="inline-flex rounded-full bg-muted/40 p-3 mb-4">
                <MailX className="w-6 h-6 text-muted-foreground" />
              </div>
              <h1 className="text-base font-medium mb-1.5">
                Missing unsubscribe link
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This page needs a valid unsubscribe token. Open the link from
                the footer of any Cortex ticket email.
              </p>

              <div className="mt-6 flex items-center justify-center gap-2">
                <Link
                  href="/help"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to Help
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Open settings
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-[10px] text-muted-foreground text-center">
          Cortex &mdash; the external mind
        </p>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}
