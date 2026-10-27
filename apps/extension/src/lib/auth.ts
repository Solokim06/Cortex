/**
 * Clerk authentication + Cortex API token exchange for the extension.
 *
 * Flow:
 *   1. User pastes a connect code (Clerk sign-in ticket)
 *   2. We redeem it for a Clerk session via @clerk/clerk-js
 *   3. We immediately exchange the Clerk JWT for a long-lived Cortex API
 *      token via POST /extension/api-token
 *   4. The long-lived token is what we store. All API calls use it.
 *   5. When the cx_ token expires (30 days), we re-mint using the still-
 *      valid Clerk session (no user interaction needed).
 *
 * Runs in the options page --- Clerk's SDK needs window/document.
 */

import { Clerk } from "@clerk/clerk-js";
import {
  setSession,
  clearSession,
  setProfile,
  getSession,
  updateClerkToken,
} from "./storage";
import { getMe, mintApiToken } from "./api";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

let clerkInstance: Clerk | null = null;

async function getClerk(): Promise<Clerk> {
  if (!PUBLISHABLE_KEY) {
    throw new AuthError(
      "Missing VITE_CLERK_PUBLISHABLE_KEY. Create apps/extension/.env.local and rebuild.",
    );
  }
  if (clerkInstance) return clerkInstance;

  const clerk = new Clerk(PUBLISHABLE_KEY);
  await clerk.load();
  clerkInstance = clerk;
  return clerk;
}

/**
 * Full sign-in: redeem the ticket, then mint a Cortex API token.
 */
export async function redeemTicket(ticket: string): Promise<void> {
  const clerk = await getClerk();

  // If Clerk already has an active session in this extension (from a
  // prior connect, or a stale one), sign it out first. Otherwise the
  // ticket redeem fails with "you're already signed in".
  try {
    if (clerk.session) {
      await clerk.signOut();
    }
  } catch {
    // best-effort --- continue either way
  }

  const client = clerk.client;
  if (!client) {
    throw new AuthError("Clerk client is not ready. Try again in a moment.");
  }

  try {
    // 1. Redeem the ticket
    const signIn = await client.signIn.create({
      strategy: "ticket",
      ticket: ticket.trim(),
    });

    if (signIn.status !== "complete") {
      throw new AuthError(
        "Sign-in ticket did not complete. It may have expired or been used already.",
      );
    }

    await clerk.setActive({ session: signIn.createdSessionId });

    const session = clerk.session;
    if (!session) {
      throw new AuthError("Clerk did not return a session.");
    }

    const clerkToken = await session.getToken();
    if (!clerkToken) {
      throw new AuthError("Clerk session has no token.");
    }

    const clerkUserId = session.user?.id ?? "";

    // 2. Immediately exchange the Clerk JWT for a long-lived Cortex token
    const minted = await mintApiToken(clerkToken, "browser extension");
    const cortexExpiresAt = new Date(minted.expires_at).getTime();

    // 3. Store both tokens. All API calls will use the cx_ one.
    await setSession({
      cortexApiToken: minted.token,
      cortexApiTokenExpiresAt: cortexExpiresAt,
      clerkToken,
      clerkTokenExpiresAt: Date.now() + 55_000,
      clerkUserId,
    });

    // 4. Cache the profile (also confirms the cx_ token works)
    const me = await getMe();
    await setProfile({
      userId: me.user_id,
      email: me.email,
      firstName: me.first_name,
      lastName: me.last_name,
      signedInAt: Date.now(),
    });
  } catch (e) {
    await clearSession();
    if (e instanceof AuthError) throw e;
    if (e instanceof Error) throw new AuthError(e.message);
    throw new AuthError("Unknown error during sign-in.");
  }
}

/**
 * Refresh the short-lived Clerk JWT inside the stored session. Called
 * lazily when a Clerk-only operation is needed (e.g. re-minting a cx_
 * token after it expires).
 */
export async function refreshClerkToken(): Promise<void> {
  const clerk = await getClerk();
  const session = clerk.session;
  if (!session) {
    throw new AuthError("No active Clerk session. Sign in again.");
  }
  const token = await session.getToken();
  if (!token) {
    throw new AuthError("Clerk session has no token.");
  }
  await updateClerkToken(token, Date.now() + 55_000);
}

/**
 * If the long-lived Cortex API token is missing or expired, mint a new one
 * using the still-valid Clerk session. Silently succeeds if not needed.
 */
export async function ensureFreshCortexToken(): Promise<void> {
  const existing = await getSession();
  if (!existing) {
    throw new AuthError("Not signed in.");
  }

  // 24-hour buffer so the token never expires mid-use
  const oneDay = 24 * 60 * 60 * 1000;
  if (existing.cortexApiTokenExpiresAt > Date.now() + oneDay) return;

  const clerk = await getClerk();
  const clerkSession = clerk.session;
  if (!clerkSession) {
    throw new AuthError("Clerk session gone. Sign in again.");
  }

  const clerkToken = await clerkSession.getToken();
  if (!clerkToken) {
    throw new AuthError("Clerk session has no token.");
  }

  const minted = await mintApiToken(clerkToken, "browser extension (refresh)");
  await setSession({
    ...existing,
    cortexApiToken: minted.token,
    cortexApiTokenExpiresAt: new Date(minted.expires_at).getTime(),
  });
}

export async function signOut(): Promise<void> {
  const clerk = await getClerk();
  try {
    await clerk.signOut();
  } catch {
    // ignore
  }
  await clearSession();
  clerkInstance = null;
}
