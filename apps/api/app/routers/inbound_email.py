"""
Inbound email webhook.

Provider: Postmark Inbound (default). The payload is flat JSON:

    {
      "From": "Alice <alice@example.com>",
      "To":   "reply+<ticket-id>@inbound.cortex.local",
      "Subject": "Re: New reply on your ticket",
      "TextBody": "Thanks, that worked!",
      "MessageID": "…"
    }

Auth: HTTP Basic. Configure the same credentials in Postmark's
Inbound webhook settings and in `INBOUND_EMAIL_WEBHOOK_SECRET` (any
non-empty string — this is not a real username).

Always returns 200 (even on failure) so the provider doesn't retry
bad payloads forever. Failures are logged with a reason.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.config.settings import settings
from app.db.session import get_db
from app.services import inbound_email as inbound_service

router = APIRouter(prefix="/inbound", tags=["inbound"])


def _verify_basic(authorization: str | None) -> bool:
    """Basic-auth gate. If no secret is configured, allow everything."""
    secret = getattr(settings, "inbound_email_webhook_secret", None)
    if not secret:
        return True
    if not authorization or not authorization.lower().startswith("basic "):
        return False
    import base64
    try:
        raw = base64.b64decode(authorization.split(" ", 1)[1]).decode("utf-8")
    except Exception:  # noqa: BLE001
        return False
    _, _, password = raw.partition(":")
    return password == secret


@router.post("/email")
async def inbound_email_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not _verify_basic(authorization):
        # Postmark will show a 401 in its webhook activity log
        return {"ok": False, "reason": "unauthorized"}

    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        return {"ok": False, "reason": "invalid_json"}

    try:
        result = await inbound_service.handle_inbound_email(db, payload)
    except Exception as e:  # noqa: BLE001
        print(f"[inbound/email] handler crashed: {e}")
        result = {"ok": False, "reason": "handler_error"}

    # Always 200 — providers should not retry bad payloads
    return result
