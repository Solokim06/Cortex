/**
 * Cortex API client — authenticated.
 *
 * Every request is signed with the current Clerk session token and
 * carries the current UI locale in the `X-Locale` header so the
 * backend can respond in the user's language.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// AI-processing consent: read the current choice from cookie / localStorage
// so we can attach X-AI-Consent to every backend request. The backend uses
// this to gate LLM calls (see app/services/consent.py).
// ---------------------------------------------------------------------------

type RawConsent = { aiProcessing?: boolean; updatedAt?: string };

function readConsentCookie(): RawConsent | null {
  if (typeof document === "undefined") return null;
  const name = "cortex_consent=";
  for (const c of document.cookie.split(";").map((s) => s.trim())) {
    if (c.startsWith(name)) {
      try {
        return JSON.parse(decodeURIComponent(c.slice(name.length)));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function readConsentLS(): RawConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("cortex_consent");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readAiConsentHeader(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromCookie = readConsentCookie();
    const fromLS = readConsentLS();
    let chosen = fromCookie;
    if (fromCookie && fromLS) {
      chosen =
        new Date(fromCookie.updatedAt ?? 0) >= new Date(fromLS.updatedAt ?? 0)
          ? fromCookie
          : fromLS;
    } else if (!chosen) {
      chosen = fromLS;
    }
    if (!chosen) return null;
    return chosen.aiProcessing ? "true" : "false";
  } catch {
    return null;
  }
}


const KNOWN_LOCALES = ["en", "es", "fr", "de", "ar", "sw"];

export class CortexAPIError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`Cortex API error ${status}: ${detail}`);
    this.name = "CortexAPIError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
};

/**
 * Determine the current UI locale.
 *
 * Priority:
 *  1. Explicit argument
 *  2. First segment of the current URL (e.g. "/es/chat" → "es")
 *  3. `NEXT_LOCALE` cookie
 *  4. "en"
 */
export function getCurrentLocale(explicit?: string): string {
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    const first = window.location.pathname.split("/")[1];
    if (first && KNOWN_LOCALES.includes(first)) return first;

    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (match) {
      const code = decodeURIComponent(match[1]).slice(0, 2).toLowerCase();
      if (KNOWN_LOCALES.includes(code)) return code;
    }
  }

  return "en";
}

/**
 * Core authenticated fetch wrapper.
 * `getToken` is provided by Clerk's useAuth() hook.
 */
export async function cortexFetch<T>(
  path: string,
  getToken: () => Promise<string | null>,
  options: RequestOptions & { locale?: string } = {},
): Promise<T> {
  const { method = "GET", body, signal, locale } = options;

  const token = await getToken();
  if (!token) {
    throw new CortexAPIError(401, "Not signed in");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-Locale": getCurrentLocale(locale),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // AI-processing consent — attach so the backend can gate LLM calls.
  const aiConsent = readAiConsentHeader();
  if (aiConsent !== null) {
    headers["X-AI-Consent"] = aiConsent;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      // ignore JSON parse error
    }
    throw new CortexAPIError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Authenticated multipart upload (for voice capture, file attach).
 */
export async function cortexUpload<T>(
  path: string,
  formData: FormData,
  getToken: () => Promise<string | null>,
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new CortexAPIError(401, "Not signed in");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-Locale": getCurrentLocale(),
  };
  const aiConsent = readAiConsentHeader();
  if (aiConsent !== null) {
    headers["X-AI-Consent"] = aiConsent;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      // ignore
    }
    throw new CortexAPIError(response.status, detail);
  }

  return (await response.json()) as T;
}

export const API_BASE = API_URL;
