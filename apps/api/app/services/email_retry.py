"""
Email retry engine.

Scans `email_deliveries` for rows where:
  - status == "failed"
  - attempt < settings.email_max_attempts
  - enough time has passed per backoff schedule

...and re-sends them by re-rendering the template from the stored
context. We don't store the rendered HTML on the delivery row (would
bloat the DB); instead we reconstruct the same context dict and re-run
`send_email()` — but with a fresh attempt counter.

To reconstruct context, we:
  1. Look up the ticket by `ticket_id`
  2. Look up the filer / assignee as needed
  3. Pass the same template name + subject

This means retries are stateless — the worker doesn't need any special
state beyond the delivery row itself.

Failure handling:
  - Each retry attempt bumps `attempt` by 1
  - Max attempts from settings (`EMAIL_MAX_ATTEMPTS`, default 3)
  - After final failure, the row stays status="failed" and stops retrying
  - Successful retry flips status="sent" and records message_id + sent_at
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import EmailDelivery, FeedbackTicket, User
from app.db.session import AsyncSessionLocal


SCAN_INTERVAL_SECONDS = 60     # wake up once a minute
MAX_RETRIES_PER_RUN = 25       # don't hog a single scan


# =====================================================================
# backoff
# =====================================================================


def backoff_seconds(attempt: int) -> int:
    """
    attempt=1 → base
    attempt=2 → base * 3
    attempt=3 → base * 9
    Capped at 1 hour.
    """
    base = max(5, settings.email_retry_base_seconds)
    secs = base * (3 ** max(0, attempt - 1))
    return min(secs, 3600)


def _eligible(
    delivery: EmailDelivery,
    *,
    now: datetime,
) -> bool:
    if delivery.status != "failed":
        return False

    max_attempts = max(1, settings.email_max_attempts)
    if delivery.attempt >= max_attempts:
        return False

    # Error cases that shouldn't be retried (permanent failures)
    err = (delivery.error or "").lower()
    permanent_markers = (
        "invalid email",
        "not verified",
        "domain",
        "blocked",
        "suppressed",
        "template error",
    )
    if any(m in err for m in permanent_markers):
        return False

    # Backoff check
    ref = delivery.sent_at or delivery.created_at
    if ref is None:
        return True
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)

    wait = backoff_seconds(delivery.attempt)
    return (now - ref).total_seconds() >= wait


# =====================================================================
# context reconstruction
# =====================================================================


async def _rebuild_context(
    db: AsyncSession,
    delivery: EmailDelivery,
) -> dict | None:
    """
    Reconstruct the template context for a retry.

    We only have ticket_id + recipient email. We rebuild everything we
    can from those. Some fields (like `assigner` on assignment emails)
    are lost — that's acceptable for retries.
    """
    if not delivery.ticket_id:
        return None

    res = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == delivery.ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if ticket is None:
        return None

    # Filer
    filer_res = await db.execute(
        select(User).where(User.id == ticket.user_id)
    )
    filer = filer_res.scalar_one_or_none()

    ticket_ctx = {
        "id": str(ticket.id),
        "subject": ticket.subject,
        "description": ticket.description,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "created_at": (
            ticket.created_at.isoformat() if ticket.created_at else None
        ),
    }

    filer_ctx = None
    if filer:
        filer_ctx = {
            "id": str(filer.id),
            "name": filer.name,
            "email": filer.email,
        }

    # Common context — a superset of what any template needs
    ctx: dict = {
        "ticket": ticket_ctx,
        "filer": filer_ctx,
        "assigner": None,          # unknown after the fact
        "recipient": {
            "name": None,
            "email": delivery.to_email,
        },
        "reply": {"content": "(retry — original content unavailable)"},
        "category": "first_response",
        "priority": ticket.priority,
    }
    return ctx


# =====================================================================
# retry one
# =====================================================================


async def _retry_one(
    db: AsyncSession,
    delivery: EmailDelivery,
) -> str:
    """
    Attempt a single retry. Mutates `delivery` in place.
    Returns one of: "sent" | "failed" | "skipped".
    """
    from app.services import email as email_service

    ctx = await _rebuild_context(db, delivery)
    if ctx is None:
        delivery.error = "retry: could not reconstruct context"
        return "failed"

    # Bump attempt BEFORE the send so a crash doesn't infinite-loop.
    delivery.attempt = delivery.attempt + 1

    # Send directly, but bypass the suppression check so we don't
    # re-classify a "suppressed" delivery as suppressed again.
    try:
        from app.services.email import _dispatch, _render_both

        html, text = _render_both(delivery.template, ctx)
        provider = settings.email_provider
        if provider == "disabled":
            delivery.error = "retry: email disabled"
            return "failed"

        ok, message_id, error = await _dispatch(
            provider, delivery.to_email, delivery.subject, html, text, None
        )
        if ok:
            delivery.status = "sent"
            delivery.message_id = message_id
            delivery.sent_at = datetime.now(timezone.utc)
            delivery.error = None
            return "sent"
        delivery.error = f"retry attempt {delivery.attempt}: {error}"
        return "failed"
    except Exception as e:  # noqa: BLE001
        delivery.error = f"retry attempt {delivery.attempt}: {e}"
        return "failed"


# =====================================================================
# one scan pass
# =====================================================================


async def retry_failed_emails(
    db: AsyncSession | None = None,
) -> dict:
    """
    Scan and retry failed email deliveries.

    Returns:
      {"scanned": N, "retried": M, "succeeded": S, "failed": F, "skipped": K}
    """
    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    now = datetime.now(timezone.utc)
    stats = {"scanned": 0, "retried": 0, "succeeded": 0, "failed": 0, "skipped": 0}

    try:
        result = await db.execute(
            select(EmailDelivery)
            .where(EmailDelivery.status == "failed")
            .order_by(EmailDelivery.created_at.asc())
            .limit(500)
        )
        candidates = list(result.scalars().all())
        stats["scanned"] = len(candidates)

        retried_this_run = 0
        for d in candidates:
            if retried_this_run >= MAX_RETRIES_PER_RUN:
                break
            if not _eligible(d, now=now):
                stats["skipped"] += 1
                continue

            outcome = await _retry_one(db, d)
            stats["retried"] += 1
            retried_this_run += 1
            if outcome == "sent":
                stats["succeeded"] += 1
            else:
                stats["failed"] += 1

        if retried_this_run:
            await db.commit()
        return stats

    finally:
        if owns_session:
            await db.__aexit__(None, None, None)


# =====================================================================
# background worker
# =====================================================================

_worker_task: asyncio.Task | None = None
_worker_stop: asyncio.Event | None = None


async def _worker_loop() -> None:
    assert _worker_stop is not None
    print("[email-retry] worker started")

    while not _worker_stop.is_set():
        try:
            stats = await retry_failed_emails()
            if stats["retried"]:
                print(
                    f"[email-retry] scanned={stats['scanned']} "
                    f"retried={stats['retried']} "
                    f"ok={stats['succeeded']} fail={stats['failed']}"
                )
        except Exception as e:  # noqa: BLE001
            print(f"[email-retry] scan failed: {e}")

        try:
            await asyncio.wait_for(
                _worker_stop.wait(),
                timeout=SCAN_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            pass

    print("[email-retry] worker stopped")


def start_worker() -> asyncio.Task:
    """Spawn the retry worker. Idempotent."""
    global _worker_task, _worker_stop
    if _worker_task is not None and not _worker_task.done():
        return _worker_task

    _worker_stop = asyncio.Event()
    _worker_task = asyncio.create_task(_worker_loop(), name="email-retry")
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


# =====================================================================
# diagnostics
# =====================================================================


async def count_failed_emails(db: AsyncSession) -> int:
    """Count failed deliveries still under the retry cap. For admin health."""
    from sqlalchemy import func, or_

    max_attempts = max(1, settings.email_max_attempts)
    stmt = (
        select(func.count())
        .select_from(EmailDelivery)
        .where(
            EmailDelivery.status == "failed",
            EmailDelivery.attempt < max_attempts,
        )
    )
    result = await db.execute(stmt)
    return int(result.scalar_one())
