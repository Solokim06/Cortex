import { ReactNode } from "react";
import { headers } from "next/headers";
import { Brain, LogIn } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@clerk/nextjs/server";
import { OpenCookiePreferencesLink } from "@/components/landing/OpenCookiePreferencesLink";

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { userId } = await auth();
  const signedIn = !!userId;

  // Read the current pathname so we can hide the header on the landing page.
  // Landing pages read better without a top nav — the hero's "Start free"
  // button and the footer cover everything the header would.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || hdrs.get("x-invoke-path") || "";
  // Strip the locale prefix (e.g. "/en", "/es") for the check.
  const pathWithoutLocale = pathname.replace(/^\/(en|es|fr|de|ar|sw)(?=\/|$)/, "") || "/";
  const isLanding = pathWithoutLocale === "/" || pathWithoutLocale === "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster position="top-center" richColors closeButton />
      {/* Header — full nav on all public pages except the landing page.
          On the landing page we keep only the brand (logo + wordmark + Beta)
          since the hero and footer already cover Support and Sign in. */}
      {isLanding ? (
        <header className="sticky top-0 z-30 border-b border-border bg-background/60 backdrop-blur-sm">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <Brain className="w-4 h-4 text-primary" />
              <span>Cortex</span>
              <span className="inline-flex items-center rounded-full border border-border/70 bg-card/60 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Beta
              </span>
            </Link>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-30 border-b border-border bg-background/60 backdrop-blur-sm">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <Brain className="w-4 h-4 text-primary" />
              <span>Cortex</span>
            </Link>

            <nav className="flex items-center gap-6 text-xs">
              <Link
                href="/support"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Support
              </Link>
              {signedIn ? (
                <Link
                  href="/home"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Open Cortex
                </Link>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <LogIn className="w-3 h-3" />
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
      )}

      {/* Main */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr] gap-8 sm:gap-6">
            {/* Brand */}
            <div className="col-span-2 sm:col-span-1 space-y-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold tracking-tight">
                  Cortex
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                The external mind. Capture anything, ask it questions, and
                watch your knowledge graph think back.
              </p>
            </div>

            {/* Product */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Product
              </p>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link
                    href="/features"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/changelog"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Changelog
                  </Link>
                </li>
                <li>
                  <Link
                    href={signedIn ? "/home" : "/sign-in"}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {signedIn ? "Open Cortex" : "Sign in"}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Company
              </p>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link
                    href="/contact"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Contact us
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Terms of Use
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Resources
              </p>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link
                    href="/support"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Help center
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy/cookies"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cookie policy
                  </Link>
                </li>
                <li>
                  <OpenCookiePreferencesLink>
                    Cookie preferences
                  </OpenCookiePreferencesLink>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-border/60">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              © {new Date().getFullYear()} Cortex
            </p>
            <p className="text-[11px] text-muted-foreground text-center sm:text-right">
              Built by an independent developer · Privacy-first · Always exportable
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
