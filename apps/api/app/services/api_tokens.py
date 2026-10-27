"""
Long-lived Cortex API tokens for the browser extension (and future CLI).

Design:
  - 32 bytes of CSPRNG randomness, encoded as URL-safe base64, prefixed with
    "cx_" so it's recognizable in logs and UIs.
  - Only the SHA-256 hex digest is stored. The plaintext is returned once.
  - Revocation = deleting the row.
  - Expiry: default 30 days, capped at 365.

Usage in auth:
  get_current_user() tries to verify the bearer token as a Clerk JWT first;
  if that fails, it checks the api_tokens table.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ApiToken


TOKEN_PREFIX = "cx_"
TOKEN_BYTES = 32
DEFAULT_EXPIRY_DAYS = 30
MAX_EXPIRY_DAYS = 365


# ---------- Internal helpers ----------

def _generate_plaintext() -> tuple[str, str, str]:
    """
    Returns (plaintext, token_hash_hex, prefix).

    plaintext      — full token including the "cx_" prefix
    token_hash_hex — SHA-256 hex digest, what we store
    prefix         — first 11 chars, e.g. "cx_abc12de" — for UI display
    """
    raw = secrets.token_urlsafe(TOKEN_BYTES)
    plaintext = f"{TOKEN_PREFIX}{raw}"
    token_hash = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    prefix = plaintext[:11]
    return plaintext, token_hash, prefix


def hash_token(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


# ---------- Public API ----------

async def mint_token(
    db: AsyncSession,
    user_id: str,
    label: str | None = None,
    expires_in_days: int = DEFAULT_EXPIRY_DAYS,
) -> tuple[str, ApiToken]:
    """
    Create a new API token for the user.

    Returns (plaintext, row). The plaintext must be given to the caller
    once and never stored. The row contains only the hash.
    """
    days = max(1, min(expires_in_days, MAX_EXPIRY_DAYS))
    plaintext, token_hash, prefix = _generate_plaintext()
    expires_at = datetime.now(timezone.utc) + timedelta(days=days)

    row = ApiToken(
        user_id=user_id,
        token_hash=token_hash,
        token_prefix=prefix,
        label=(label or "").strip() or None,
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return plaintext, row


async def lookup_token(
    db: AsyncSession,
    plaintext: str,
) -> ApiToken | None:
    """
    Find a non-expired token row by plaintext.

    Returns None if missing or expired. Expired rows are NOT deleted here
    — callers may want to log them, and periodic cleanup can be a job.
    """
    if not plaintext.startswith(TOKEN_PREFIX):
        return None

    token_hash = hash_token(plaintext)
    result = await db.execute(
        select(ApiToken).where(ApiToken.token_hash == token_hash)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    if row.expires_at <= datetime.now(timezone.utc):
        return None

    return row


async def touch_token(db: AsyncSession, row: ApiToken) -> None:
    """Record that the token was used. Best-effort — failures are silent."""
    try:
        row.last_used_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        await db.rollback()


async def revoke_token(
    db: AsyncSession,
    token_id: str,
    user_id: str,
) -> bool:
    """Delete a token by ID, scoped to the owning user. Returns True if deleted."""
    result = await db.execute(
        select(ApiToken)
        .where(ApiToken.id == token_id)
        .where(ApiToken.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return False

    await db.delete(row)
    await db.commit()
    return True


async def list_tokens(
    db: AsyncSession,
    user_id: str,
) -> list[ApiToken]:
    """List all tokens for a user (metadata only — no plaintext)."""
    result = await db.execute(
        select(ApiToken)
        .where(ApiToken.user_id == user_id)
        .order_by(ApiToken.created_at.desc())
    )
    return list(result.scalars().all())
