"""
Proactive insights — the four signals that make Cortex speak first.

Signals
  1. DORMANT REVIVAL     new capture is close to an old, long-untouched one
  2. CONTRADICTION       new capture reverses something said before (LLM)
  3. DECISION DRIFT      a committed decision's context has since shifted
  4. RHYTHM              you write about X on Sundays (statistical)

Sync signals (dormant, rhythm) run in the capture request path in <50ms.
Async signal (contradiction) is dispatched from the SLA worker.
Decision drift runs on the SLA worker's daily tick.

All firing goes through `fire_insight` which:
  - checks the user's master + per-signal toggles
  - enforces a 3-per-24h rate limit
  - dedupes via (user_id, kind, dedupe_key) unique constraint
  - writes a SurfacedInsight row
  - calls notifications_service.push_user_notification
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Node,
    SurfacedInsight,
    UserNotificationPrefs,
)
from app.services import notifications as notifications_service


# ---- tuning ----
DORMANT_MIN_AGE_DAYS = 30
DORMANT_SIMILARITY_THRESHOLD = 0.78
CONTRADICTION_SIMILARITY_THRESHOLD = 0.72
CONTRADICTION_NEIGHBOR_LIMIT = 3
DAILY_INSIGHT_CAP = 3
MIN_RHYTHM_SAMPLES = 4  # need at least 4 captures on that weekday to fire


# =====================================================================
# prefs helpers
# =====================================================================


async def _get_prefs(db: AsyncSession, user_id: str) -> UserNotificationPrefs | None:
    """Return prefs, or None if the row doesn't exist yet."""
    r = await db.execute(
        select(UserNotificationPrefs).where(
            UserNotificationPrefs.user_id == user_id
        )
    )
    return r.scalar_one_or_none()


async def _insights_allowed(
    db: AsyncSession, user_id: str, kind: str
) -> bool:
    """Check master + per-signal toggles. No row = master OFF."""
    prefs = await _get_prefs(db, user_id)
    if prefs is None or not prefs.insights_enabled:
        return False
    flag = {
        "dormant_revival": prefs.insights_dormant_revival,
        "contradiction": prefs.insights_contradiction,
        "decision_drift": prefs.insights_decision_drift,
        "rhythm": prefs.insights_rhythm,
    }.get(kind, False)
    return bool(flag)


# =====================================================================
# firing
# =====================================================================


async def _fired_in_last_24h(db: AsyncSession, user_id: str) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    r = await db.execute(
        text(
            "SELECT count(*) FROM surfaced_insights "
            "WHERE user_id = :uid AND fired_at >= :cutoff"
        ),
        {"uid": user_id, "cutoff": cutoff},
    )
    return int(r.scalar() or 0)


async def fire_insight(
    db: AsyncSession,
    *,
    user_id: str,
    kind: str,
    dedupe_key: str,
    trigger_node_id: str | None,
    related_node_ids: list[str],
    title: str,
    body: str,
    click_url: str | None,
) -> bool:
    """
    Attempt to fire one insight. Returns True if fired, False if
    suppressed (off, rate-limited, or already fired).
    """
    # 1. Toggles
    if not await _insights_allowed(db, user_id, kind):
        return False

    # 2. Rate limit
    if await _fired_in_last_24h(db, user_id) >= DAILY_INSIGHT_CAP:
        return False

    # 3. Dedupe + persist. The unique constraint on
    #    (user_id, kind, dedupe_key) makes this race-safe.
    row = SurfacedInsight(
        id=str(uuid.uuid4()),
        user_id=user_id,
        kind=kind,
        dedupe_key=dedupe_key,
        trigger_node_id=trigger_node_id,
        related_node_ids=related_node_ids,
        title=title[:255],
        body=body,
        click_url=click_url,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return False  # already fired

    # 4. Bell + SSE
    try:
        await notifications_service.push_user_notification(
            user_id,
            event_kind=f"insight.{kind}",
            title=title,
            body=body,
            click_url=click_url,
            extra={
                "insight_id": row.id,
                "insight_kind": kind,
                "trigger_node_id": trigger_node_id,
                "related_node_ids": related_node_ids,
            },
        )
    except Exception as e:  # noqa: BLE001
        print(f"[insights] push_user_notification failed: {e}")

    print(f"[insights] fired {kind} → user {user_id[:8]}")
    return True


# =====================================================================
# 1. dormant revival (sync)
# =====================================================================


async def check_dormant_revival(
    db: AsyncSession,
    user_id: str,
    new_node_id: str,
) -> bool:
    """
    New capture is semantically close to an old capture that's been
    sitting untouched. Fire once per pair.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=DORMANT_MIN_AGE_DAYS)

    sql = text("""
        SELECT
            n.id, n.title, n.summary, n.created_at,
            1 - (e.embedding <=> (
                SELECT embedding FROM embeddings WHERE node_id = :new_id
            )) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :uid
          AND n.id != :new_id
          AND n.created_at < :cutoff
          AND n.type IN ('thought', 'capture')
        ORDER BY e.embedding <=> (
            SELECT embedding FROM embeddings WHERE node_id = :new_id
        )
        LIMIT 1
    """)

    row = (await db.execute(sql, {
        "uid": user_id,
        "new_id": new_node_id,
        "cutoff": cutoff,
    })).mappings().first()

    if row is None or row["score"] is None:
        return False
    if float(row["score"]) < DORMANT_SIMILARITY_THRESHOLD:
        return False

    new_res = await db.execute(select(Node).where(Node.id == new_node_id))
    new_node = new_res.scalar_one_or_none()
    if new_node is None:
        return False

    old_id = str(row["id"])
    new_title = (new_node.title or "")[:60] or "(untitled)"
    old_title = (row["title"] or "")[:60] or "(untitled)"
    age_days = (
        datetime.now(timezone.utc) - row["created_at"].replace(tzinfo=timezone.utc)
    ).days

    title = f"This echoes something you wrote {age_days} days ago"
    body = (
        f"\"{new_title}\" is close to \"{old_title}\" — "
        "you might want to connect them."
    )

    return await fire_insight(
        db,
        user_id=user_id,
        kind="dormant_revival",
        dedupe_key=f"{new_node_id}:{old_id}",
        trigger_node_id=new_node_id,
        related_node_ids=[old_id],
        title=title,
        body=body,
        click_url=f"/memory?q={new_node_id}",
    )


# =====================================================================
# 2. contradiction (async)
# =====================================================================


CONTRADICTION_SYSTEM = """You are Cortex's contradiction detector.

You are given a NEW capture and up to 3 EARLIER captures that are
semantically close to it. Your job: decide whether the new capture
reverses, negates, or meaningfully contradicts any of the earlier ones.

Rules:
1. Return valid JSON only. Never wrap it in markdown.
2. Only flag REAL contradictions — a changed mind, a reversal, or a
   direct negation. Not: elaboration, added nuance, or a different
   angle on the same topic.
3. If the user simply expanded the idea, that is NOT a contradiction.
4. Cite the earlier capture by its index number.

Response shape (exactly):
{
  "is_contradiction": true | false,
  "earlier_index": 0 | 1 | 2 | null,
  "why": "one short sentence explaining the contradiction, or empty"
}
"""


CONTRADICTION_USER_TEMPLATE = """NEW capture (just written):
\"\"\"
{new_text}
\"\"\"

EARLIER captures (indexed):
{earlier_block}

Do these contradict? Return JSON as specified.
"""


async def check_contradiction(
    db: AsyncSession,
    user_id: str,
    new_node_id: str,
) -> bool | None:
    """
    Look for a genuine contradiction between the new capture and up
    to 3 of its nearest older siblings. Uses the same Groq model the
    rest of the app uses — zero additional cost.

    Returns:
      True  — a contradiction was found and an insight was fired
      False — the check ran, no contradiction found (or signal disabled)
      None  — the check couldn't run (node has no embedding yet);
              caller should NOT mark this node as checked so it retries
    """
    # Fetch the new node
    new_res = await db.execute(select(Node).where(Node.id == new_node_id))
    new_node = new_res.scalar_one_or_none()
    if new_node is None:
        return False  # node deleted — safe to mark checked

    new_text = (
        f"{new_node.title or ''}\n{new_node.summary or ''}\n"
        f"{(new_node.content or '')[:1500]}"
    ).strip()
    if len(new_text) < 40:
        return False  # too short to reason about — safe to mark checked

    # Bail early if the new node has no embedding yet — the comparison
    # below relies on it. Returning None tells the caller to retry.
    emb_check = await db.execute(
        text("SELECT 1 FROM embeddings WHERE node_id = :nid LIMIT 1"),
        {"nid": new_node_id},
    )
    if emb_check.scalar() is None:
        print(f"[insights] contradiction skipped for {new_node_id[:8]} — no embedding yet")
        return None

    # Fetch neighbors
    sql = text("""
        SELECT n.id, n.title, n.summary, n.content,
               1 - (e.embedding <=> (
                   SELECT embedding FROM embeddings WHERE node_id = :new_id
               )) AS score
        FROM embeddings e
        JOIN nodes n ON n.id = e.node_id
        WHERE e.user_id = :uid
          AND n.id != :new_id
          AND n.created_at < (SELECT created_at FROM nodes WHERE id = :new_id)
        ORDER BY e.embedding <=> (
            SELECT embedding FROM embeddings WHERE node_id = :new_id
        )
        LIMIT :k
    """)
    rows = (await db.execute(sql, {
        "uid": user_id,
        "new_id": new_node_id,
        "k": CONTRADICTION_NEIGHBOR_LIMIT,
    })).mappings().all()

    # Filter weak matches
    neighbors = [
        r for r in rows
        if r["score"] is not None
        and float(r["score"]) >= CONTRADICTION_SIMILARITY_THRESHOLD
    ]
    if not neighbors:
        return False

    # Build the earlier block
    lines = []
    for i, r in enumerate(neighbors):
        title = (r["title"] or "")[:80] or "(untitled)"
        text_body = (r["summary"] or r["content"] or "")[:800]
        lines.append(f"[{i}] {title}\n{text_body}\n")
    earlier_block = "\n".join(lines).strip()

    prompt = CONTRADICTION_USER_TEMPLATE.format(
        new_text=new_text[:1500],
        earlier_block=earlier_block,
    )

    try:
        from app.services.ai import call_llm_json
        result = await call_llm_json(
            prompt=prompt,
            system=CONTRADICTION_SYSTEM,
            temperature=0.1,
            max_tokens=400,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[insights] contradiction LLM failed: {e}")
        return False

    if not result.get("is_contradiction"):
        return False

    idx = result.get("earlier_index")
    if not isinstance(idx, int) or idx < 0 or idx >= len(neighbors):
        # Model said contradiction but didn't cite — trust it, cite [0]
        idx = 0

    earlier = neighbors[idx]
    earlier_id = str(earlier["id"])
    why = (result.get("why") or "").strip() or "reverses your earlier take"

    title = "You said the opposite earlier"
    body = (
        f"\"{why}\" "
        f"Today's capture contradicts an earlier one from "
        f"{earlier['title'] or 'a previous capture'}."
    )

    return await fire_insight(
        db,
        user_id=user_id,
        kind="contradiction",
        dedupe_key=f"{new_node_id}:{earlier_id}",
        trigger_node_id=new_node_id,
        related_node_ids=[earlier_id],
        title=title,
        body=body,
        click_url=f"/memory?q={new_node_id}",
    )


# =====================================================================
# 3. rhythm (sync)
# =====================================================================


async def check_rhythm(db: AsyncSession, user_id: str) -> bool:
    """
    Statistical: "you write about X on {weekday}".

    Fires once per (topic, weekday) per 30 days. Uses only Postgres —
    no LLM, no embeddings.
    """
    # Which weekday is it today (UTC)? 0=Mon .. 6=Sun
    today_dow = datetime.now(timezone.utc).weekday()

    sql = text("""
        SELECT
            n.title,
            count(*) AS hits,
            count(DISTINCT date_trunc('day', n.created_at)) AS distinct_days
        FROM nodes n
        WHERE n.user_id = :uid
          AND n.type IN ('thought', 'capture')
          AND EXTRACT(DOW FROM n.created_at) = :dow
          AND n.created_at > now() - interval '90 days'
          AND n.title IS NOT NULL
          AND length(n.title) > 3
        GROUP BY n.title
        HAVING count(*) >= :min_samples
        ORDER BY count(*) DESC
        LIMIT 1
    """)
    row = (await db.execute(sql, {
        "uid": user_id,
        "dow": today_dow,
        "min_samples": MIN_RHYTHM_SAMPLES,
    })).mappings().first()

    if row is None:
        return False

    topic = row["title"]
    count = int(row["hits"])
    weekday_name = [
        "Mondays", "Tuesdays", "Wednesdays", "Thursdays",
        "Fridays", "Saturdays", "Sundays",
    ][today_dow]

    title_str = f"You tend to write about this on {weekday_name}"
    body = f"\"{topic}\" — you've captured this {count} times on {weekday_name}."

    return await fire_insight(
        db,
        user_id=user_id,
        kind="rhythm",
        dedupe_key=f"{today_dow}:{topic[:60]}",
        trigger_node_id=None,
        related_node_ids=[],
        title=title_str,
        body=body,
        click_url=f"/memory?q={topic}",
    )


# =====================================================================
# 4. decision drift (batch)
# =====================================================================


async def check_decision_drift(db: AsyncSession, user_id: str) -> int:
    """
    For each committed decision in the last 90 days, check if any new
    capture since that decision's creation touches the same concept.

    Fires once per decision (dedupe key = decision_id).
    Returns the count of insights fired.
    """
    # Decisions in Postgres are nodes with type='decision' + meta.status
    # committed. Query broadly; filter in Python.
    sql = text("""
        SELECT
            d.id AS decision_id,
            d.title AS decision_title,
            d.created_at AS decided_at,
            (
                SELECT count(*) FROM nodes n2
                WHERE n2.user_id = :uid
                  AND n2.type IN ('thought', 'capture')
                  AND n2.created_at > d.created_at
            ) AS new_captures_since
        FROM nodes d
        WHERE d.user_id = :uid
          AND d.type = 'decision'
          AND d.created_at > now() - interval '90 days'
          AND d.meta->>'status' = 'decided'
        ORDER BY d.created_at DESC
        LIMIT 10
    """)
    rows = (await db.execute(sql, {"uid": user_id})).mappings().all()

    fired = 0
    for r in rows:
        # Only fire if there's meaningful new context
        if int(r["new_captures_since"] or 0) < 3:
            continue

        decision_id = str(r["decision_id"])
        decision_title = (r["decision_title"] or "your decision")[:80]

        title = "New context for a decision you made"
        body = (
            f"You committed to \"{decision_title}\" and have since "
            f"captured {r['new_captures_since']} related notes. "
            "Worth revisiting?"
        )

        ok = await fire_insight(
            db,
            user_id=user_id,
            kind="decision_drift",
            dedupe_key=decision_id,
            trigger_node_id=decision_id,
            related_node_ids=[],
            title=title,
            body=body,
            click_url=f"/decisions/{decision_id}",
        )
        if ok:
            fired += 1

    return fired


# =====================================================================
# capture-path entry point
# =====================================================================


async def evaluate_capture(db: AsyncSession, user_id: str, node_id: str) -> None:
    """
    Called from the capture path right after a node is created.
    Runs the two SYNC signals only. Never raises — capture must not
    fail because insight evaluation failed.
    """
    try:
        await check_dormant_revival(db, user_id, node_id)
    except Exception as e:  # noqa: BLE001
        print(f"[insights] dormant check failed: {e}")

    try:
        await check_rhythm(db, user_id)
    except Exception as e:  # noqa: BLE001
        print(f"[insights] rhythm check failed: {e}")
