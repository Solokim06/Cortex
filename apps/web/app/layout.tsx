// Root layout is intentionally minimal.
//
// Because the app uses next-intl routing, the real <html>/<body>,
// ClerkProvider, NextIntlClientProvider, and font setup live in
// app/[locale]/layout.tsx. Next.js requires *some* root layout, so
// this one just forwards children.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
