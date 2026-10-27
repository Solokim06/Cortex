"""
Clerk Backend API client.

The frontend and extension use Clerk's frontend SDK for sessions. The backend
occasionally needs to call Clerk's Backend API (which requires the secret key)
to mint things like sign-in tokens for third-party clients.

Docs: https://clerk.com/docs/reference/backend-api
"""
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config.settings import settings


CLERK_API_BASE = "https://api.clerk.com/v1"


def _auth_headers() -> dict[str, str]:
    if not settings.clerk_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLERK_SECRET_KEY is not configured on the server.",
        )
    return {
        "Authorization": f"Bearer {settings.clerk_secret_key}",
        "Content-Type": "application/json",
    }


async def create_sign_in_token(
    user_id: str,
    expires_in_seconds: int = 300,
) -> dict[str, Any]:
    """
    Mint a short-lived Clerk sign-in token for a user.

    The extension's frontend will call `signIn.create({ strategy: 'ticket',
    ticket: <token> })` to exchange it for a real Clerk session.

    Docs:
      POST https://api.clerk.com/v1/sign_in_tokens
      { user_id: "user_xxx", expires_in_seconds: 300 }

    Response shape (as of Clerk's current API):
      {
        "object": "sign_in_token",
        "id": "sit_...",
        "user_id": "user_...",
        "token": "eyJ...",           ← the actual ticket
        "status": "pending",
        "expires_at": 1234567890,
        "created_at": 1234567890
      }
    """
    payload = {
        "user_id": user_id,
        "expires_in_seconds": max(60, min(expires_in_seconds, 1800)),
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{CLERK_API_BASE}/sign_in_tokens",
            headers=_auth_headers(),
            json=payload,
        )

    if resp.status_code >= 400:
        detail = _extract_error(resp)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Clerk sign-in token failed: {detail}",
        )

    body = resp.json()

    # Sanity log so we notice if Clerk ever renames the "token" key.
    if isinstance(body, dict):
        has_ticket = bool(body.get("token") or body.get("jwt"))
        if not has_ticket:
            print(
                "[Cortex] Clerk sign-in token response has no ticket field. "
                f"Keys: {list(body.keys())}"
            )

    return body


def _extract_error(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except Exception:
        return f"HTTP {resp.status_code}"
    errors = body.get("errors") if isinstance(body, dict) else None
    if isinstance(errors, list) and errors:
        first = errors[0]
        if isinstance(first, dict):
            return first.get("long_message") or first.get("message") or str(first)
    if isinstance(body, dict) and "message" in body:
        return str(body["message"])
    return f"HTTP {resp.status_code}"


async def fetch_user(user_id: str) -> dict[str, Any] | None:
    """Fetch a Clerk user by ID. Returns None if not found."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{CLERK_API_BASE}/users/{user_id}",
            headers=_auth_headers(),
        )
    if resp.status_code == 404:
        return None
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Clerk fetch user failed: {_extract_error(resp)}",
        )
    return resp.json()
