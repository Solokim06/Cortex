import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ThemeProvider } from "@teispace/next-themes";
import { Providers } from "../providers";
import { Toaster } from "@/components/ui/sonner";
import { isRtl, locales } from "@/i18n/config";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cortex — The external mind",
  description:
    "Capture everything you learn, connect it intelligently, and think with an external mind that grows with you.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cortex",
  },
  other: {
    // Prevent iOS Safari from auto-linking anything that looks like a
    // phone number, address, or date in captured content. Critical for
    // Cortex: user captures may contain phone-like strings that should
    // render as plain text, not tappable tel: links.
    "format-detection": "telephone=no, email=no, address=no, date=no",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen bg-background text-foreground`}
      >
        <ClerkProvider
          afterSignOutUrl="/sign-in"
          signInFallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/home"
          appearance={{
            theme: dark,
            variables: {
              colorPrimary: "#6366f1",
              colorBackground: "#0f0f0f",
              colorInput: "#1a1a1a",
              colorInputForeground: "#fafafa",
              colorDanger: "#ef4444",
              colorSuccess: "#22c55e",
              colorWarning: "#f59e0b",
              borderRadius: "0.5rem",
              fontFamily: "var(--font-inter)",
            },
            elements: {
              userButtonPopoverCard:
                "bg-[#0f0f0f] border border-white/10 shadow-2xl shadow-black/50",
              userButtonPopoverActionButton:
                "text-neutral-200 hover:bg-white/5 hover:text-white",
              userButtonPopoverActionButtonText: "text-neutral-200 font-medium",
              userButtonPopoverActionButtonIcon: "text-neutral-400",
              userButtonPopoverFooter: "hidden",
              userPreviewMainIdentifier: "text-white font-semibold",
              userPreviewSecondaryIdentifier: "text-neutral-400",
              card: "bg-[#0f0f0f] border border-white/10 shadow-2xl shadow-black/50",
              headerTitle: "text-white font-semibold",
              headerSubtitle: "text-neutral-400",
              socialButtonsBlockButton:
                "bg-white/5 border border-white/10 text-white hover:bg-white/10",
              socialButtonsBlockButtonText: "text-white font-medium",
              formFieldLabel: "text-neutral-300",
              formFieldInput:
                "bg-white/5 border border-white/10 text-white placeholder:text-neutral-500",
              formButtonPrimary:
                "bg-indigo-600 hover:bg-indigo-500 text-white font-medium",
              footerActionLink: "text-indigo-400 hover:text-indigo-300",
              footerActionText: "text-neutral-400",
              dividerLine: "bg-white/10",
              dividerText: "text-neutral-500",
              identityPreviewText: "text-neutral-200",
              identityPreviewEditButtonIcon: "text-indigo-400",
              formResendCodeLink: "text-indigo-400 hover:text-indigo-300",
              otpCodeFieldInput: "bg-white/5 border-white/10 text-white",
              alertText: "text-neutral-200",
            },
          }}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <NextIntlClientProvider locale={locale} messages={messages}>
              <Providers>
                {children}
                <Toaster
                  position="bottom-right"
                  theme="dark"
                  toastOptions={{
                    style: {
                      background: "#0f0f0f",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fafafa",
                    },
                  }}
                />
              </Providers>
            </NextIntlClientProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
