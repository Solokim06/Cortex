"""
Tier 8 -- stale concept detection.

A concept is stale when it has not been touched in a while: no edges
created or updated, no topic synthesis generated, and it is older
than the threshold. Marks and clears `Node.stale_since` accordingly.
The user can dismiss the flag for a period via `dismiss_stale`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ---- tuning ----
STALE_THRESHOLD_DAYS = 60
DEFAULT_DISMISS_DAYS = 90


# =====================================================================
# public entry point
# =====================================================================


async def scan_stale_for_user(db: AsyncSession, user_id: str) -> dict:
    """
    Recompute stale status for every canonical concept of this user.

    Concepts older than the threshold that have had no edge activity
    and no topic-synthesis activity in the same window get marked stale.
    Concepts that have resumed activity get cleared.

    Dismissed nodes (stale_dismissed_until > now) are skipped entirely.

    Returns:
      {"marked": N, "cleared": M, "dismissed_skipped": K, "scanned": T}
    """
    from app.config.settings import get_settings
    try:
        threshold_days = int(get_settings().stale_threshold_days)
    except Exception:  # noqa: BLE001
        threshold_days = STALE_THRESHOLD_DAYS

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=threshold_days)

    # 1. Fetch all canonical concepts for this user with the metadata we
    #    need to decide their status.
    rows = (await db.execute(text(
        "SELECT n.id, n.created_at, n.stale_since, n.stale_dismissed_until, "
        "       (SELECT max(e.created_at) FROM edges e "
        "        WHERE e.from_node_id = n.id OR e.to_node_id = n.id) AS last_edge_at, "
        "       (SELECT max(ts.generated_at) FROM topic_syntheses ts "
        "        WHERE ts.concept_id = n.id) AS last_synthesis_at "
        "FROM nodes n "
        "WHERE n.user_id = :uid "
        "  AND n.type = 'concept' "
        "  AND n.canonical_concept_id IS NULL"
    ), {"uid": user_id})).mappings().all()

    marked = 0
    cleared = 0
    dismissed_skipped = 0

    for r in rows:
        node_id = str(r["id"])
        created = r["created_at"]
        currently_stale = r["stale_since"] is not None

        # Skip dismissed nodes whose dismissal is still in effect
        dismissed_until = r["stale_dismissed_until"]
        if dismissed_until is not None:
            if dismissed_until.tzinfo is None:
                dismissed_until = dismissed_until.replace(tzinfo=timezone.utc)
            if dismissed_until > now:
                dismissed_skipped += 1
                # If it was stale, leave it as-is but the worker won't
                # re-flag it. Clear stale_since while dismissed so the UI
                # does not show it.
                if currently_stale:
                    await db.execute(text(
                        "UPDATE nodes SET stale_since = NULL WHERE id = :nid"
                    ), {"nid": node_id})
                    cleared += 1
                continue

        # Normalize datetimes to tz-aware
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        last_edge = r["last_edge_at"]
        if last_edge is not None and last_edge.tzinfo is None:
            last_edge = last_edge.replace(tzinfo=timezone.utc)
        last_synth = r["last_synthesis_at"]
        if last_synth is not None and last_synth.tzinfo is None:
            last_synth = last_synth.replace(tzinfo=timezone.utc)

        # Compute the "last activity" for this node
        last_activity = created
        for dt in (last_edge, last_synth):
            if dt is not None and (last_activity is None or dt > last_activity):
                last_activity = dt

        is_stale = (
            last_activity is not None and last_activity < cutoff
        )

        if is_stale and not currently_stale:
            await db.execute(text(
                "UPDATE nodes SET stale_since = :now WHERE id = :nid"
            ), {"nid": node_id, "now": now})
            marked += 1
        elif not is_stale and currently_stale:
            await db.execute(text(
                "UPDATE nodes SET stale_since = NULL WHERE id = :nid"
            ), {"nid": node_id})
            cleared += 1

    if marked or cleared:
        await db.commit()

    return {
        "marked": marked,
        "cleared": cleared,
        "dismissed_skipped": dismissed_skipped,
        "scanned": len(rows),
    }


async def dismiss_stale(
    db: AsyncSession,
    user_id: str,
    node_id: str,
    days: int = DEFAULT_DISMISS_DAYS,
) -> bool:
    """
    User action: mute the stale flag for this concept for `days`.

    Sets stale_dismissed_until = now + days, clears stale_since.
    Returns True if the node was found and updated.
    """
    now = datetime.now(timezone.utc)
    until = now + timedelta(days=days)
    result = await db.execute(text(
        "UPDATE nodes "
        "SET stale_dismissed_until = :until, stale_since = NULL "
        "WHERE id = :nid AND user_id = :uid AND type = 'concept'"
    ), {"nid": node_id, "uid": user_id, "until": until})
    await db.commit()
    return bool(result.rowcount)


async def clear_dismissal(
    db: AsyncSession,
    user_id: str,
    node_id: str,
) -> bool:
    """
    Remove a dismissal early (so the concept can be re-flagged on the
    next scan if it's still dormant).
    """
    result = await db.execute(text(
        "UPDATE nodes SET stale_dismissed_until = NULL "
        "WHERE id = :nid AND user_id = :uid"
    ), {"nid": node_id, "uid": user_id})
    await db.commit()
    return bool(result.rowcount)
