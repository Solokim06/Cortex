/**
 * Contact submission client.
 *
 * Two paths:
 *   - Signed in:  POST /help/feedback    (auth, linked to the user)
 *   - Anonymous:  POST /help/feedback/public  (rate-limited by IP)
 *
 * The caller decides which by passing a token or null.
 */

import { API_BASE } from "./cortex";

export type ContactCategory = "bug" | "feature" | "question" | "other";

export type ContactPayload = {
  category: ContactCategory;
  subject: string;
  description: string;
  /** Optional reply-to address. Only used on the anonymous path. */
  contact_email?: string;
  /** Honeypot — must be empty for a human submission. */
  website?: string;
};

export type ContactResponse = {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at?: string;
  resolved_at?: string | null;
};

export class ContactError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public retryAfterSeconds?: number,
  ) {
    super(detail);
    this.name = "ContactError";
  }
}

/**
 * Submit a contact message.
 *
 * @param payload  The message
 * @param token    Clerk session token, or null for anonymous
 */
export async function submitContact(
  payload: ContactPayload,
  token: string | null,
): Promise<ContactResponse> {
  const path = token ? "/help/feedback" : "/help/feedback/public";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    const retryHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryHeader
      ? parseInt(retryHeader, 10) || undefined
      : undefined;
    throw new ContactError(response.status, detail, retryAfterSeconds);
  }

  return (await response.json()) as ContactResponse;
}
