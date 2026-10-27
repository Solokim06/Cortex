"""
Consent helpers.

Centralizes the "is AI processing allowed for this user?" question that
gates the six capture-enrichment LLM calls:

    extract_concepts, classify_capture, extract_image_text,
    detect_key_moments, embed_one, update_user_model

Resolution order (header wins when present):
    1. X-AI-Consent request header — reflects the browser's current
       consent choice, including a toggle the user just clicked. This
       is the live source of truth for this session. Two sources:
         a) the explicit `request` argument (if the caller passes one)
         b) the contextvar set by middleware on every request
    2. User's DB preference (`user_preferences.ai_processing`)
       — the persisted fallback. Used for background jobs (SLA workers,
       embedding queue) that have no request context.
    3. Default: True
       — legacy behavior; existing users implicitly consented.

Design note: the frontend stores the consent choice in a cookie AND
localStorage, and sends the current value on every API request via
X-AI-Consent. The DB record persists the same choice across devices
once we wire the modal's Save button to PATCH /user/prefs — until
then, the header is the reliable signal for this session.
"""

from __future__ import annotations

from contextvars import ContextVar

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.prefs_user import get_prefs


# Request-scoped AI consent header. Set by middleware on every incoming
# request so that downstream services can read it without threading
# `request` through every function signature (capture_text, extract_from_file,
# _extract_image, voice.transcribe_and_capture, etc. don't take a Request).
_ai_consent_header: ContextVar[str | None] = ContextVar(
    "ai_consent_header", default=None
)


def set_ai_consent_header(value: str | None) -> None:
    """Called by middleware on each request. Stores the header value
    in the current async context so downstream service calls can read it."""
    _ai_consent_header.set(value)


def get_ai_consent_header() -> str | None:
    """Read the current request's AI consent header (or None)."""
    return _ai_consent_header.get()


def _parse_header(value: str | None) -> bool | None:
    """Parse a header string to a boolean, or None if unparseable."""
    if value is None:
        return None
    v = value.strip().lower()
    if v in {"1", "true", "yes", "on"}:
        return True
    if v in {"0", "false", "no", "off"}:
        return False
    return None


async def is_ai_processing_allowed(
    db: AsyncSession | None,
    user_id: str | None,
    request: Request | None = None,
) -> bool:
    # 1. Live header — from the explicit request arg if provided,
    #    otherwise from the contextvar set by middleware.
    header = None
    if request is not None:
        header = request.headers.get("x-ai-consent")
    if header is None:
        header = get_ai_consent_header()
    parsed = _parse_header(header)
    if parsed is not None:
        return parsed

    # 2. Persisted DB preference (fallback for background jobs)
    if db is not None and user_id:
        try:
            prefs = await get_prefs(db, str(user_id))
            return bool(prefs.ai_processing)
        except Exception as e:
            print(f"[Cortex] consent: DB lookup failed, falling back: {e}")

    # 3. Default: legacy users implicitly consent
    return True
