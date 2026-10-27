/**
 * Cortex API client.
 * Talks to the FastAPI backend at NEXT_PUBLIC_API_URL.
 * Authenticated via Clerk session tokens (added in Phase 2).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  token?: string;
  signal?: AbortSignal;
};

export async function cortexFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, token, signal } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
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
 * Multipart upload (for voice capture).
 */
export async function cortexUpload<T>(
  path: string,
  formData: FormData,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
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


// ============================================================
// Binary fetch helper — for content served by auth-gated routes
// ============================================================

/**
 * Fetch a binary file (e.g. an uploaded video) with the given auth token
 * and return a blob URL suitable for use in <video src=...> or <img src=...>.
 *
 * The caller MUST revoke the URL via URL.revokeObjectURL() when done.
 */
export async function fetchBlobUrl(
  path: string,
  token: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });

  if (!response.ok) {
    throw new CortexAPIError(
      response.status,
      response.statusText || "Failed to load binary content",
    );
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
