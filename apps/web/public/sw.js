/**
 * Cortex Service Worker
 *
 * Hand-written, no Workbox, no build step. Sits at /sw.js and is served
 * by Next.js as a static file. Registered from app/providers.tsx.
 *
 * Strategy (hybrid D + A):
 *   1. Non-GET → bypass (never cached; writes must reach server)
 *   2. GET /api/* on allowlist → cache-first, revalidate in background
 *   3. GET /api/* off allowlist → network-first (3s), cache fallback
 *   4. GET static assets (hashed) → cache-first, no revalidate
 *   5. GET HTML navigation → network-first, cache fallback, offline page
 *
 * Caches:
 *   cortex-v1-static  — immutable assets
 *   cortex-v1-api     — API GET responses (100 FIFO)
 *   cortex-v1-html    — HTML navigations (100 FIFO)
 *
 * Version bump: any caching-behavior change → v1 → v2. Activate deletes
 * all caches whose name doesn't start with the current version.
 */

const VERSION = "v1";
const STATIC_CACHE = `cortex-${VERSION}-static`;
const API_CACHE = `cortex-${VERSION}-api`;
const HTML_CACHE = `cortex-${VERSION}-html`;

const API_CACHE_MAX = 100;
const HTML_CACHE_MAX = 100;
const NETWORK_TIMEOUT_MS = 3000;

const CACHE_FIRST_API_PATTERNS = [
  /^\/api\/memory\/search/,
  /^\/api\/memory\/topics(\/.*)?$/,
  /^\/api\/conversations(\/.*)?$/,
  /^\/api\/captures\/recent/,
  /^\/api\/reflections(\/.*)?$/,
  /^\/api\/identity(\/.*)?$/,
  /^\/api\/learning(\/.*)?$/,
];

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const excess = keys.length - max;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
}

function offlineJson() {
  return new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

function offlineHtml() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Offline — Cortex</title>
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <style>body{font-family:system-ui;background:#0a0a0a;color:#fafafa;
     display:flex;align-items:center;justify-content:center;
     min-height:100vh;margin:0;text-align:center;padding:2rem}
     h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#888;margin:0;font-size:.9rem}</style>
     </head><body><div><h1>You're offline</h1>
     <p>Cortex will resume when you reconnect.</p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// ---------- install ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

// ---------- activate ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(`cortex-${VERSION}-`))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// ---------- helpers ----------

function isCacheFirstApi(url) {
  return CACHE_FIRST_API_PATTERNS.some((re) => re.test(url.pathname));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)
  );
}

// ---------- message ----------
// Manual skipWaiting trigger from the app. Our registration doesn't send
// this (skipWaiting runs automatically on install), but it's here for
// future use — e.g. a "reload to update" prompt.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ---------- fetch ----------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/api/")) {
    if (isCacheFirstApi(url)) {
      event.respondWith(cacheFirstRevalidate(request));
    } else {
      event.respondWith(networkFirstApi(request));
    }
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstHtml(request));
  }
});

// ---------- strategies ----------

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503 });
  }
}

async function cacheFirstRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  // Kick off revalidation (fire-and-forget, doesn't block the response).
  const revalidate = fetch(request)
    .then(async (response) => {
      if (response && response.status === 200) {
        await cache.put(request, response.clone());
        await trimCache(API_CACHE, API_CACHE_MAX);
      }
    })
    .catch(() => {});

  if (cached) {
    return cached;
  }

  // No cache — wait for the network, but if it fails return offline JSON.
  try {
    await revalidate;
    const fresh = await cache.match(request);
    if (fresh) return fresh;
    return offlineJson();
  } catch {
    return offlineJson();
  }
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      timeout(NETWORK_TIMEOUT_MS),
    ]);
    if (response && response.status === 200) {
      await cache.put(request, response.clone());
      await trimCache(API_CACHE, API_CACHE_MAX);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineJson();
  }
}

async function networkFirstHtml(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      await cache.put(request, response.clone());
      await trimCache(HTML_CACHE, HTML_CACHE_MAX);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match("/");
    if (fallback) return fallback;
    return offlineHtml();
  }
}
