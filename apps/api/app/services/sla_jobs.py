"""
SLA background jobs.

One worker, two responsibilities:

  1. RECOMPUTE --- for every open ticket, verify its SLA due dates are
     still correct (priority may have been changed outside the API, or
     policy updated). Cheap; runs every cycle.

  2. BREACH SCAN --- find tickets that just crossed a breach threshold and
     fire a webhook alert per ticket, once. We record the breach alert
     in the ticket event log so we never double-fire.

The worker sleeps between scans. On startup, it also runs one immediate
scan so the dashboard counters are correct from minute zero.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FeedbackTicket, Node, TicketEvent
from app.db.session import AsyncSessionLocal
from app.services import notifications as notifications_service
from app.services import sla as sla_service
from app.services import ticket_events as events_service
from app.services import webhooks as webhooks_service


SCAN_INTERVAL_SECONDS = 300  # 5 minutes
BREACH_EVENT_KIND = "sla_breached"


# ---------------------------------------------------------------------
# breach scan
# ---------------------------------------------------------------------


def _breach_categories(ticket: FeedbackTicket, now: datetime) -> list[str]:
    """
    Return which SLAs are breached for this ticket: subset of
    {"first_response", "resolution"}.
    """
    status = sla_service.sla_status(ticket, now=now)
    breached: list[str] = []
    if status["first_response"]["breached"]:
        breached.append("first_response")
    if status["resolution"]["breached"]:
        breached.append("resolution")
    return breached


async def _already_alerted(
    db: AsyncSession,
    ticket_id: str,
    category: str,
) -> bool:
    """
    Have we already fired a breach alert for this (ticket, category)?

    Breach alerts are stored as ticket_events with kind="sla_breached"
    and data = {"category": ...}.
    """
    stmt = select(TicketEvent.id).where(
        TicketEvent.ticket_id == ticket_id,
        TicketEvent.kind == BREACH_EVENT_KIND,
    )
    rows = (await db.execute(stmt)).all()

    if not rows:
        return False

    # Need to check data.category --- do it in Python since JSON querying
    # varies across dialects.
    stmt2 = select(TicketEvent).where(
        TicketEvent.ticket_id == ticket_id,
        TicketEvent.kind == BREACH_EVENT_KIND,
    )
    events = list((await db.execute(stmt2)).scalars().all())
    for e in events:
        data = e.data or {}
        if data.get("category") == category:
            return True
    return False


async def scan_sla_breaches(
    db: AsyncSession | None = None,
) -> dict:
    """
    Find open tickets that are breaching their SLA and haven't been
    alerted yet. Records a ticket_event + dispatches a webhook per
    (ticket, category) pair.

    Returns:
      {
        "scanned": N,
        "breached_total": M,
        "alerted": K,
        "recomputed": R,
      }
    """
    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    now = datetime.now(timezone.utc)
    stats = {"scanned": 0, "breached_total": 0, "alerted": 0, "recomputed": 0}

    try:
        # 1. Open tickets only (terminal statuses don't breach)
        stmt = select(FeedbackTicket).where(
            FeedbackTicket.status.in_(["open", "in_progress"])
        )
        result = await db.execute(stmt)
        tickets = list(result.scalars().all())
        stats["scanned"] = len(tickets)

        for ticket in tickets:
            # 2. Opportunistic recompute: if due dates missing, apply
            if (
                ticket.first_response_due_at is None
                or ticket.resolution_due_at is None
            ):
                await sla_service.apply_sla_to_ticket(db, ticket, commit=False)
                stats["recomputed"] += 1

            # 3. Detect breaches
            categories = _breach_categories(ticket, now)
            if not categories:
                continue
            stats["breached_total"] += len(categories)

            for category in categories:
                # 4. Skip if already alerted
                if await _already_alerted(db, str(ticket.id), category):
                    continue

                # 5. Log breach event
                await events_service.log_event(
                    db,
                    ticket_id=str(ticket.id),
                    kind=BREACH_EVENT_KIND,
                    actor_kind=events_service.ACTOR_SYSTEM,
                    actor_user_id=None,
                    data={
                        "category": category,
                        "detected_at": now.isoformat(),
                        "priority": ticket.priority,
                    },
                    commit=False,
                )

                # 6. Dispatch webhook
                await webhooks_service.dispatch(
                    db,
                    event_kind=f"ticket.sla_breached.{category}",
                    ticket=ticket,
                    extra={"category": category},
                    commit=False,
                )

                # 7. Email notify (fire-and-forget; never blocks the scan)
                try:
                    await notifications_service.notify_sla_breach(
                        db,
                        ticket,
                        category=category,
                        priority=ticket.priority,
                    )
                except Exception as e:  # noqa: BLE001
                    print(f"[sla-jobs] notify_sla_breach failed: {e}")

                stats["alerted"] += 1

        if stats["recomputed"] or stats["alerted"]:
            await db.commit()

        return stats

    finally:
        if owns_session:
            await db.__aexit__(None, None, None)


# ---------------------------------------------------------------------
# near-breach scan (for notification-driven UI)
# ---------------------------------------------------------------------


async def near_breach_tickets(
    db: AsyncSession,
    *,
    within_minutes: int = 60,
) -> list[FeedbackTicket]:
    """
    Return open tickets whose first_response or resolution SLA will
    breach within `within_minutes`. Useful for an admin "at-risk" tab.
    """
    now = datetime.now(timezone.utc)
    horizon_seconds = within_minutes * 60

    stmt = select(FeedbackTicket).where(
        FeedbackTicket.status.in_(["open", "in_progress"])
    )
    result = await db.execute(stmt)
    tickets = list(result.scalars().all())

    at_risk: list[FeedbackTicket] = []
    for ticket in tickets:
        status = sla_service.sla_status(ticket, now=now)

        for key in ("first_response", "resolution"):
            secs = status[key].get("seconds_remaining")
            if secs is None:
                continue
            # Positive but close = at risk; negative = already breached (skip)
            if 0 <= secs <= horizon_seconds:
                at_risk.append(ticket)
                break

    return at_risk


# ---------------------------------------------------------------------
# insight scan (piggybacks on this worker)
# ---------------------------------------------------------------------


async def scan_pending_insights(
    db: AsyncSession | None = None,
    *,
    window_minutes: int = 120,  # wide enough to survive embedding lag
    batch_size: int = 40,
) -> dict:
    """
    Find captures created in the last `window_minutes` that haven't
    been contradiction-checked yet, run the check, mark them checked.

    Runs every SLA cycle (5 min by default). Contradictions are not
    time-critical, so a few minutes' delay is fine.
    """
    from app.db.models import Node, InsightCheck
    from app.services import insights as insights_service

    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    stats = {"checked": 0, "fired": 0}
    try:
        cutoff = datetime.now(timezone.utc) - __import__("datetime").timedelta(
            minutes=window_minutes
        )

        # Candidates: recent captures that don't have an InsightCheck row.
        sql = select(Node).where(
            Node.type.in_(["thought", "capture"]),
            Node.created_at >= cutoff,
        ).order_by(Node.created_at.desc()).limit(batch_size)

        nodes = list((await db.execute(sql)).scalars().all())

        for node in nodes:
            check_exists = await db.execute(
                select(InsightCheck).where(InsightCheck.node_id == node.id)
            )
            if check_exists.scalar_one_or_none() is not None:
                continue

            try:
                fired = await insights_service.check_contradiction(
                    db, str(node.user_id), str(node.id)
                )
            except Exception as e:  # noqa: BLE001
                print(f"[sla-jobs] contradiction failed for {node.id}: {e}")
                # Treat exceptions as "couldn't check" so we retry later
                continue

            # None means "couldn't check (no embedding yet)" --- don't
            # write the marker, so this node gets retried next cycle.
            if fired is None:
                continue

            db.add(InsightCheck(node_id=node.id))
            stats["checked"] += 1
            if fired:
                stats["fired"] += 1

        if stats["checked"]:
            await db.commit()

        return stats
    finally:
        if owns_session:
            await db.__aexit__(None, None, None)


async def scan_decision_drift(
    db: AsyncSession | None = None,
    *,
    batch_size: int = 50,
) -> dict:
    """
    Run decision-drift detection for every user with recent decisions.
    Called once every ~N cycles (heavier operation).
    """
    from app.db.models import User
    from app.services import insights as insights_service

    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    stats = {"users_checked": 0, "fired": 0}
    try:
        # Users with at least one decision created in the last 90 days
        sql = (
            select(User)
            .where(
                User.id.in_(
                    select(Node.user_id).where(
                        Node.type == "decision",
                    )
                )
            )
            .limit(batch_size)
        )
        users = list((await db.execute(sql)).scalars().all())

        for u in users:
            try:
                fired = await insights_service.check_decision_drift(db, str(u.id))
                stats["users_checked"] += 1
                stats["fired"] += fired
            except Exception as e:  # noqa: BLE001
                print(f"[sla-jobs] decision-drift failed for {u.id}: {e}")

        return stats
    finally:
        if owns_session:
            await db.__aexit__(None, None, None)


# ---------------------------------------------------------------------
# stale concept scan (Tier 8, runs ~daily)
# ---------------------------------------------------------------------


async def scan_stale_concepts(
    db: AsyncSession | None = None,
    *,
    batch_size: int = 50,
) -> dict:
    """
    Recompute stale status for every user's canonical concepts.

    Slow-moving signal: the threshold is 60 days, so this runs roughly
    once per day. Bounded by batch_size users per call.

    Returns:
      {"users_checked": N, "marked": total_marked, "cleared": total_cleared}
    """
    from app.db.models import User
    from app.services import stale as stale_service

    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    stats = {"users_checked": 0, "marked": 0, "cleared": 0}
    try:
        # Users who have at least one concept
        sql = (
            select(User)
            .where(
                User.id.in_(
                    select(Node.user_id).where(Node.type == "concept")
                )
            )
            .limit(batch_size)
        )
        users = list((await db.execute(sql)).scalars().all())

        for u in users:
            try:
                result = await stale_service.scan_stale_for_user(db, str(u.id))
                stats["users_checked"] += 1
                stats["marked"] += result.get("marked", 0)
                stats["cleared"] += result.get("cleared", 0)
            except Exception as e:  # noqa: BLE001
                print(f"[sla-jobs] stale scan failed for {u.id}: {e}")

        return stats
    finally:
        if owns_session:
            await db.__aexit__(None, None, None)


# ---------------------------------------------------------------------
# embedding queue worker
# ---------------------------------------------------------------------


async def process_embedding_queue(
    db: AsyncSession | None = None,
    *,
    batch_size: int = 5,
) -> dict:
    """
    Embed any nodes waiting in embedding_queue. Runs every SLA cycle.

    Batch size is small (5) because Voyage's free tier rate-limits at
    ~3 req/sec --- 5 nodes ??? 1.7s of sleep, which is fine for the 5-min
    worker cycle.
    """
    from app.db.models import EmbeddingQueue, Node
    from app.services.memory import upsert_embedding

    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    stats = {"processed": 0, "failed": 0}
    try:
        # Oldest first
        rows = list(
            (
                await db.execute(
                    select(EmbeddingQueue)
                    .order_by(EmbeddingQueue.queued_at.asc())
                    .limit(batch_size)
                )
            ).scalars().all()
        )
        if not rows:
            return stats

        for row in rows:
            node_res = await db.execute(
                select(Node).where(Node.id == row.node_id)
            )
            node = node_res.scalar_one_or_none()

            if node is None:
                # Node was deleted --- drop from queue
                await db.delete(row)
                continue

            text_for_embedding = (
                f"{node.title or ''}\n{node.summary or ''}\n{node.content or ''}"
            ).strip()

            if not text_for_embedding:
                await db.delete(row)
                continue

            try:
                await upsert_embedding(
                    db, str(node.user_id), str(node.id), text_for_embedding
                )
                await db.delete(row)
                stats["processed"] += 1
                # Voyage free tier is ~3 req/sec --- throttle.
                import asyncio as _asyncio
                await _asyncio.sleep(0.4)
            except Exception as e:  # noqa: BLE001
                print(f"[sla-jobs] embed failed for {node.id}: {e}")
                row.attempts = (row.attempts or 0) + 1
                # Give up after 5 attempts and drop
                if row.attempts >= 5:
                    await db.delete(row)
                stats["failed"] += 1

        await db.commit()
        return stats
    finally:
        if owns_session:
            await db.__aexit__(None, None, None)


# ---------------------------------------------------------------------
# edge generation scan
# ---------------------------------------------------------------------


async def scan_pending_edges(
    db: AsyncSession | None = None,
    *,
    window_minutes: int = 120,
    batch_size: int = 20,
) -> dict:
    """
    Find recent captures that haven't had edge generation run yet,
    run the LLM pass, and mark them checked.

    Same tri-state pattern as scan_pending_insights: nodes without
    embeddings return None and stay unchecked (retry next cycle).
    """
    from app.db.models import Node, EdgeCheck
    from app.services import edges as edges_service

    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    stats = {"checked": 0, "edges_created": 0}
    try:
        from datetime import timedelta as _td
        cutoff = datetime.now(timezone.utc) - _td(minutes=window_minutes)

        candidates = list(
            (
                await db.execute(
                    select(Node)
                    .where(
                        Node.type.in_(["thought", "capture"]),
                        Node.created_at >= cutoff,
                    )
                    .order_by(Node.created_at.desc())
                    .limit(batch_size)
                )
            ).scalars().all()
        )

        for node in candidates:
            check_exists = await db.execute(
                select(EdgeCheck).where(EdgeCheck.node_id == node.id)
            )
            if check_exists.scalar_one_or_none() is not None:
                continue

            try:
                created = await edges_service.evaluate_node_edges(
                    db, str(node.user_id), str(node.id)
                )
            except Exception as e:  # noqa: BLE001
                print(f"[sla-jobs] edge gen failed for {node.id}: {e}")
                continue

            # None means "no embedding yet" --- retry next cycle
            if created is None:
                continue

            db.add(EdgeCheck(node_id=node.id, edges_created=created))
            stats["checked"] += 1
            stats["edges_created"] += created

        if stats["checked"]:
            await db.commit()

        return stats
    finally:
        if owns_session:
            await db.__aexit__(None, None, None)


# ---------------------------------------------------------------------
# background worker
# ---------------------------------------------------------------------

_worker_task: asyncio.Task | None = None
_worker_stop: asyncio.Event | None = None


async def _worker_loop() -> None:
    assert _worker_stop is not None
    print("[sla-jobs] worker started")

    # Immediate first pass so stats are accurate on boot
    try:
        stats = await scan_sla_breaches()
        if stats["alerted"] or stats["recomputed"]:
            print(
                f"[sla-jobs] initial scan: scanned={stats['scanned']} "
                f"alerted={stats['alerted']} recomputed={stats['recomputed']}"
            )
    except Exception as e:  # noqa: BLE001
        print(f"[sla-jobs] initial scan failed: {e}")

    # Insight pass on startup (contradiction checks for last 15 min of captures)
    try:
        istats = await scan_pending_insights()
        if istats["checked"] or istats["fired"]:
            print(
                f"[sla-jobs] insight scan: checked={istats['checked']} "
                f"fired={istats['fired']}"
            )
    except Exception as e:  # noqa: BLE001
        print(f"[sla-jobs] initial insight scan failed: {e}")

    # Edge generation --- one immediate pass on startup
    try:
        edstats = await scan_pending_edges()
        if edstats["checked"] or edstats["edges_created"]:
            print(
                f"[sla-jobs] initial edge scan: checked={edstats['checked']} "
                f"edges={edstats['edges_created']}"
            )
    except Exception as e:  # noqa: BLE001
        print(f"[sla-jobs] initial edge scan failed: {e}")

    # Embedding queue --- one immediate pass on startup
    try:
        estats = await process_embedding_queue()
        if estats["processed"] or estats["failed"]:
            print(
                f"[sla-jobs] embed queue: processed={estats['processed']} "
                f"failed={estats['failed']}"
            )
    except Exception as e:  # noqa: BLE001
        print(f"[sla-jobs] embed queue failed: {e}")

    # Decision drift is heavier --- do it once per worker cycle count
    _cycle = 0
    try:
        dstats = await scan_decision_drift()
        if dstats["fired"]:
            print(f"[sla-jobs] decision drift: fired={dstats['fired']}")
    except Exception as e:  # noqa: BLE001
        print(f"[sla-jobs] initial decision-drift failed: {e}")

    # Stale scan --- one immediate pass on startup, then ~daily
    _slow_cycle = 0
    try:
        sstats = await scan_stale_concepts()
        if sstats["marked"] or sstats["cleared"]:
            print(
                f"[sla-jobs] stale scan: users={sstats['users_checked']} "
                f"marked={sstats['marked']} cleared={sstats['cleared']}"
            )
    except Exception as e:  # noqa: BLE001
        print(f"[sla-jobs] initial stale scan failed: {e}")

    while not _worker_stop.is_set():
        try:
            await asyncio.wait_for(
                _worker_stop.wait(),
                timeout=SCAN_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            pass

        if _worker_stop.is_set():
            break

        try:
            stats = await scan_sla_breaches()
            if stats["alerted"] or stats["recomputed"]:
                print(
                    f"[sla-jobs] scan: scanned={stats['scanned']} "
                    f"alerted={stats['alerted']} recomputed={stats['recomputed']}"
                )
        except Exception as e:  # noqa: BLE001
            print(f"[sla-jobs] scan failed: {e}")

        # Insight pass --- contradiction checks for recent captures
        try:
            istats = await scan_pending_insights()
            if istats["checked"] or istats["fired"]:
                print(
                    f"[sla-jobs] insight scan: checked={istats['checked']} "
                    f"fired={istats['fired']}"
                )
        except Exception as e:  # noqa: BLE001
            print(f"[sla-jobs] insight scan failed: {e}")

        # Embedding queue --- every cycle
        try:
            estats = await process_embedding_queue()
            if estats["processed"] or estats["failed"]:
                print(
                    f"[sla-jobs] embed queue: processed={estats['processed']} "
                    f"failed={estats['failed']}"
                )
        except Exception as e:  # noqa: BLE001
            print(f"[sla-jobs] embed queue failed: {e}")

        # Decision drift --- every ~6 cycles (???30 min)
        _cycle = (_cycle + 1) % 6
        if _cycle == 0:
            try:
                dstats = await scan_decision_drift()
                if dstats["fired"]:
                    print(f"[sla-jobs] decision drift: fired={dstats['fired']}")
            except Exception as e:  # noqa: BLE001
                print(f"[sla-jobs] decision drift failed: {e}")

        # Stale scan --- every ~288 cycles (~24h at 5min)
        _slow_cycle = (_slow_cycle + 1) % 288
        if _slow_cycle == 0:
            try:
                sstats = await scan_stale_concepts()
                if sstats["marked"] or sstats["cleared"]:
                    print(
                        f"[sla-jobs] stale scan: "
                        f"users={sstats['users_checked']} "
                        f"marked={sstats['marked']} "
                        f"cleared={sstats['cleared']}"
                    )
            except Exception as e:  # noqa: BLE001
                print(f"[sla-jobs] stale scan failed: {e}")

    print("[sla-jobs] worker stopped")


def start_worker() -> asyncio.Task:
    """Spawn the SLA background worker. Idempotent."""
    global _worker_task, _worker_stop
    if _worker_task is not None and not _worker_task.done():
        return _worker_task

    _worker_stop = asyncio.Event()
    _worker_task = asyncio.create_task(_worker_loop(), name="sla-jobs")
    return _worker_task


async def stop_worker() -> None:
    global _worker_task, _worker_stop
    if _worker_stop is not None:
        _worker_stop.set()
    if _worker_task is not None:
        try:
            await asyncio.wait_for(_worker_task, timeout=5)
        except asyncio.TimeoutError:
            _worker_task.cancel()
        _worker_task = None
        _worker_stop = None
