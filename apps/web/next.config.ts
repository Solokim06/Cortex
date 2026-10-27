import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  turbopack: {},
  // remove the old experimental.turbo block — it's what triggers the
  // "Unrecognized key(s) in object: 'turbo' at experimental" warning
  
  // Disable the floating Next.js DevTools badge in the bottom-left corner.
  // The "Hide" button in its preferences only persists for the current session.
  devIndicators: false,
};

export default withNextIntl(nextConfig);
