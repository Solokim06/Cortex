import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { defaultLocale, locales } from "./i18n/config";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

const PUBLIC_PATTERNS = [
  /^\/$/,                    // landing — decides what to do based on auth
  /^\/sign-in(\/.*)?$/,
  /^\/sign-up(\/.*)?$/,
  /^\/api(\/.*)?$/,
  /^\/unsubscribe(\/.*)?$/,  // public token-based unsubscribe
  /^\/status(\/.*)?$/,       // public system status page
  /^\/support(\/.*)?$/,      // public help center
  /^\/features(\/.*)?$/,     // public technical reference page
  /^\/contact(\/.*)?$/,      // public contact page — anonymous submissions allowed
  /^\/changelog(\/.*)?$/,    // public release history
];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATTERNS.some((re) => re.test(pathname));

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  const pathnameWithoutLocale = stripLocalePrefix(pathname);

  // Attach the pathname as a request header so the layout can conditionally
  // render chrome (e.g. hide the header on the landing page).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  // 1. Landing page — render the public landing route. No redirect.
  if (pathnameWithoutLocale === "/") {
    return intlMiddleware(req);
  }

  // 2. Auth enforcement on protected routes
  if (!isPublicPath(pathnameWithoutLocale)) {
    await auth.protect();
  }

  // 3. Let next-intl handle rewriting / cookie
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

function stripLocalePrefix(pathname: string): string {
  for (const loc of locales) {
    if (pathname === `/${loc}`) return "/";
    if (pathname.startsWith(`/${loc}/`)) return pathname.slice(loc.length + 1);
  }
  return pathname;
}
