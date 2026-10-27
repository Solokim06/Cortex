/**
 * Typed wrapper around chrome.storage.local.
 *
 * All extension state lives here:
 *   - Cortex session (Clerk identity + long-lived API token)
 *   - User profile (cached name / email)
 *   - Preferences (default source type, telemetry, etc.)
 */

import { browser } from "./runtime";

const SESSION_KEY = "cortex.session";
const PROFILE_KEY = "cortex.profile";
const PREFS_KEY = "cortex.prefs";

export type CortexSession = {
  /**
   * Long-lived Cortex API token (starts with "cx_"). Issued by our backend
   * via POST /extension/api-token. Used for every API call.
   */
  cortexApiToken: string;
  /** When the Cortex API token expires (ms since epoch). ~30 days out. */
  cortexApiTokenExpiresAt: number;

  /**
   * Short-lived Clerk session JWT. Only used as proof-of-identity when
   * minting a fresh Cortex API token (e.g. after the cx_ token expires).
   */
  clerkToken: string;
  /** When the Clerk JWT expires (ms). ~60 seconds out. */
  clerkTokenExpiresAt: number;

  /** The Clerk user ID (e.g. "user_2abc..."). */
  clerkUserId: string;
};

export type CortexProfile = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  signedInAt: number;
};

export type CortexPrefs = {
  defaultSourceType: "manual" | "url";
  showNotifications: boolean;
  openPanelAfterCapture: boolean;
};

const DEFAULT_PREFS: CortexPrefs = {
  defaultSourceType: "manual",
  showNotifications: true,
  openPanelAfterCapture: false,
};

// ---------- Session ----------

export async function getSession(): Promise<CortexSession | null> {
  const raw = await browser.storage.local.get(SESSION_KEY);
  const session = raw[SESSION_KEY] as CortexSession | undefined;
  if (!session) return null;

  // Session is only invalid if the *Cortex API token* has expired.
  // The short-lived Clerk JWT expiring is fine --- we can refresh it
  // later using Clerk's session.
  if (session.cortexApiTokenExpiresAt <= Date.now()) {
    await browser.storage.local.remove(SESSION_KEY);
    return null;
  }

  return session;
}

export async function setSession(session: CortexSession): Promise<void> {
  await browser.storage.local.set({ [SESSION_KEY]: session });
}

/**
 * Update just the Clerk portion of the session (used when refreshing the
 * short-lived JWT). Preserves the long-lived Cortex API token.
 */
export async function updateClerkToken(
  clerkToken: string,
  clerkTokenExpiresAt: number,
): Promise<void> {
  const existing = await getSession();
  if (!existing) return;
  await setSession({
    ...existing,
    clerkToken,
    clerkTokenExpiresAt,
  });
}

export async function clearSession(): Promise<void> {
  await browser.storage.local.remove([SESSION_KEY, PROFILE_KEY]);
}

// ---------- Profile ----------

export async function getProfile(): Promise<CortexProfile | null> {
  const raw = await browser.storage.local.get(PROFILE_KEY);
  return (raw[PROFILE_KEY] as CortexProfile | undefined) ?? null;
}

export async function setProfile(profile: CortexProfile): Promise<void> {
  await browser.storage.local.set({ [PROFILE_KEY]: profile });
}

// ---------- Prefs ----------

export async function getPrefs(): Promise<CortexPrefs> {
  const raw = await browser.storage.local.get(PREFS_KEY);
  const stored = (raw[PREFS_KEY] as Partial<CortexPrefs> | undefined) ?? {};
  return { ...DEFAULT_PREFS, ...stored };
}

export async function setPrefs(prefs: Partial<CortexPrefs>): Promise<void> {
  const current = await getPrefs();
  await browser.storage.local.set({ [PREFS_KEY]: { ...current, ...prefs } });
}
