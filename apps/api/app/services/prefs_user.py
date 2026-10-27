"""
User preferences + consent service.

Stores per-user settings that must sync across devices, including the
data-contribution consent flag. Logs consent changes for audit.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserPreferences


async def get_prefs(db: AsyncSession, user_id: str) -> UserPreferences:
    """Return the user's prefs row, creating it lazily if missing."""
    res = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    row = res.scalar_one_or_none()
    if row is not None:
        return row

    row = UserPreferences(user_id=user_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_prefs(
    db: AsyncSession,
    user_id: str,
    *,
    voice: str | None = None,
    data_contribution_optin: bool | None = None,
    agent_auto_apply: dict | None = None,
    ai_processing: bool | None = None,
    client_ip: str | None = None,
) -> UserPreferences:
    """Patch a subset of prefs. Records consent-change audits."""
    row = await get_prefs(db, user_id)

    if voice is not None:
        row.voice = voice.strip()[:32] or None

    if data_contribution_optin is not None and row.data_contribution_optin != data_contribution_optin:
        row.data_contribution_optin = data_contribution_optin
        row.data_contribution_changed_at = datetime.now(timezone.utc)
        row.data_contribution_changed_ip = (client_ip or "")[:64] or None

    if ai_processing is not None:
        row.ai_processing = bool(ai_processing)

    if agent_auto_apply is not None:
        # Sanitize: only allow boolean values on known action kinds.
        # Silently drops unrecognized keys to prevent junk accumulation.
        allowed = {
            "find_orphans", "suggest_links", "place_url",
            "merge_concepts", "reorganize",
        }
        clean = {
            k: bool(v)
            for k, v in (agent_auto_apply or {}).items()
            if k in allowed
        }
        row.agent_auto_apply = clean

    await db.commit()
    await db.refresh(row)
    return row


def prefs_to_dict(p: UserPreferences) -> dict:
    return {
        "user_id": str(p.user_id),
        "voice": p.voice,
        "data_contribution_optin": p.data_contribution_optin,
        "data_contribution_changed_at": (
            p.data_contribution_changed_at.isoformat()
            if p.data_contribution_changed_at
            else None
        ),
        "agent_auto_apply": dict(p.agent_auto_apply or {}),
        "ai_processing": bool(p.ai_processing),
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }
