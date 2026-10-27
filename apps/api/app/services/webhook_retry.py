"""
Webhook retry engine.

Failed deliveries (status_code is NULL, >= 400, or < 200) get retried
with exponential backoff up to settings.webhook_max_attempts.

Two integration points:
  1. `start_retry_worker()` — spawns an asyncio background task that
     scans webhook_deliveries every N seconds and retries eligible rows.
     Called from main.py lifespan startup.
  2. `retry_due_deliveries()` — pure function that does one scan+retry
     pass. Callable from a cron, admin endpoint, or the worker loop.

Delivery eligibility: a delivery is retried when
  - its target is still active
  - its attempt < max_attempts
  - its status_code is None OR outside 200..299
  - time since delivered_at >= backoff(attempt)

We don't create a new delivery row per retry — we update the existing one
(status_code, response_body, attempt, delivered_at) so the audit trail
shows the last attempt only. If you want full history, change _retry_one
to insert new rows instead — see comment at bottom.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import WebhookDelivery, WebhookTarget
from app.db.session import AsyncSessionLocal


# How often the background worker wakes up to scan for retries.
SCAN_INTERVAL_SECONDS = 30

# Hard stop so we never spin on a permanently broken target.
MAX_RETRIES_PER_RUN = 50

HTTP_TIMEOUT_SECONDS = 10.0


# ---------------------------------------------------------------------
# backoff
# ---------------------------------------------------------------------


def backoff_seconds(attempt: int) -> int:
    """
    attempt=1 → base
    attempt=2 → base * 3
    attempt=3 → base * 9
    Capped at 1 hour.
    """
    base = max(5, settings.webhook_retry_base_seconds)
    secs = base * (3 ** max(0, attempt - 1))
    return min(secs, 3600)


def _is_retry_eligible(
    delivery: WebhookDelivery,
    target: WebhookTarget,
    *,
    now: datetime,
) -> bool:
    if not target.is_active:
        return False

    max_attempts = max(1, settings.webhook_max_attempts)
    if delivery.attempt >= max_attempts:
        return False

    code = delivery.status_code
    if code is not None and 200 <= code < 300:
        return False

    delivered_at = delivery.delivered_at
    if delivered_at is None:
        return True
    if delivered_at.tzinfo is None:
        delivered_at = delivered_at.replace(tzinfo=timezone.utc)

    wait = backoff_seconds(delivery.attempt)
    return (now - delivered_at).total_seconds() >= wait


# ---------------------------------------------------------------------
# signing (mirrors webhooks._sign — duplicated to keep this module
# independent from the main dispatcher's imports)
# ---------------------------------------------------------------------


def _sign(body: bytes, secret: str) -> str:
    import hashlib
    import hmac

    mac = hmac.new(secret.encode("utf-8"), body, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def _effective_secret(target: WebhookTarget) -> str | None:
    return target.secret or settings.webhook_signing_secret or None


# ---------------------------------------------------------------------
# one retry
# ---------------------------------------------------------------------


async def _retry_one(
    db: AsyncSession,
    client: httpx.AsyncClient,
    delivery: WebhookDelivery,
    target: WebhookTarget,
) -> None:
    """Attempt one delivery. Mutates delivery + target in place."""
    payload = delivery.payload or {}
    body = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Cortex-Webhooks/1.0",
        "X-Cortex-Event": delivery.event_kind,
        "X-Cortex-Delivery": str(delivery.id),
        "X-Cortex-Attempt": str(delivery.attempt + 1),
        "X-Cortex-Retry": "1",
    }

    secret = _effective_secret(target)
    if secret:
        headers["X-Cortex-Signature"] = _sign(body, secret)

    status_code: int | None = None
    response_body: str | None = None

    try:
        resp = await client.post(target.url, content=body, headers=headers)
        status_code = resp.status_code
        response_body = (resp.text or "")[:2000]
    except httpx.HTTPError as e:
        response_body = f"HTTPError: {e}"[:2000]
    except Exception as e:  # noqa: BLE001
        response_body = f"Error: {e}"[:2000]

    delivery.status_code = status_code
    delivery.response_body = response_body
    delivery.attempt = delivery.attempt + 1
    delivery.delivered_at = datetime.now(timezone.utc)

    target.last_status_code = status_code
    target.last_delivery_at = datetime.now(timezone.utc)

    success = status_code is not None and 200 <= status_code < 300
    if success:
        target.failure_count = 0
    else:
        target.failure_count = (target.failure_count or 0) + 1


# ---------------------------------------------------------------------
# one scan pass
# ---------------------------------------------------------------------


async def retry_due_deliveries(
    db: AsyncSession | None = None,
) -> dict:
    """
    Scan for retry-eligible deliveries and attempt them.

    Returns:
      {
        "scanned": N, "retried": M,
        "succeeded": S, "failed": F,
        "skipped": K,
      }

    Pass an existing session (router case) or None (background worker
    case — we'll open one).
    """
    owns_session = db is None
    if owns_session:
        db = AsyncSessionLocal()
        await db.__aenter__()

    now = datetime.now(timezone.utc)
    stats = {"scanned": 0, "retried": 0, "succeeded": 0, "failed": 0, "skipped": 0}

    try:
        # Pull candidates: anything not yet succeeded at the current attempt
        # level. Cheap query — the table shouldn't grow huge.
        result = await db.execute(
            select(WebhookDelivery)
            .order_by(WebhookDelivery.delivered_at.asc())
            .limit(500)
        )
        deliveries = list(result.scalars().all())

        # Preload targets
        target_ids = {d.target_id for d in deliveries}
        if not target_ids:
            return stats

        targets_res = await db.execute(
            select(WebhookTarget).where(WebhookTarget.id.in_(list(target_ids)))
        )
        targets = {str(t.id): t for t in targets_res.scalars().all()}

        stats["scanned"] = len(deliveries)

        retried_this_run = 0
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            for delivery in deliveries:
                if retried_this_run >= MAX_RETRIES_PER_RUN:
                    break

                target = targets.get(str(delivery.target_id))
                if target is None:
                    stats["skipped"] += 1
                    continue

                if not _is_retry_eligible(delivery, target, now=now):
                    stats["skipped"] += 1
                    continue

                await _retry_one(db, client, delivery, target)
                stats["retried"] += 1
                retried_this_run += 1

                success = (
                    delivery.status_code is not None
                    and 200 <= delivery.status_code < 300
                )
                if success:
                    stats["succeeded"] += 1
                else:
                    stats["failed"] += 1

        if retried_this_run:
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
    print("[webhook-retry] worker started")

    while not _worker_stop.is_set():
        try:
            stats = await retry_due_deliveries()
            if stats["retried"]:
                print(
                    f"[webhook-retry] scanned={stats['scanned']} "
                    f"retried={stats['retried']} "
                    f"ok={stats['succeeded']} fail={stats['failed']}"
                )
        except Exception as e:  # noqa: BLE001
            print(f"[webhook-retry] scan failed: {e}")

        try:
            await asyncio.wait_for(
                _worker_stop.wait(),
                timeout=SCAN_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            pass

    print("[webhook-retry] worker stopped")


def start_retry_worker() -> asyncio.Task:
    """
    Spawn the background retry task. Safe to call once at startup.
    Returns the task so callers can inspect/await it (usually not needed).
    """
    global _worker_task, _worker_stop
    if _worker_task is not None and not _worker_task.done():
        return _worker_task

    _worker_stop = asyncio.Event()
    _worker_task = asyncio.create_task(_worker_loop(), name="webhook-retry")
    return _worker_task


async def stop_retry_worker() -> None:
    """Signal the worker to exit and wait for it to finish."""
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


# ---------------------------------------------------------------------
# notes
# ---------------------------------------------------------------------
#
# Want full delivery history (one row per attempt instead of updating
# in place)? Change _retry_one to:
#   - NOT mutate `delivery` fields
#   - db.add(WebhookDelivery(id=str(uuid4()), target_id=..., attempt=+1, ...))
#   - keep the old row untouched
# This module's eligibility check then needs to look at the *latest*
# attempt per (target_id, original_delivery_id) — add a `parent_id` FK.
#
# Current design trades history for simplicity — appropriate while
# webhook volume is low.



# ---------------------------------------------------------------------
# diagnostics
# ---------------------------------------------------------------------


async def count_failed_deliveries(db: AsyncSession) -> int:
    """
    Count deliveries whose latest attempt did not succeed. Used by the
    admin health panel.
    """
    from sqlalchemy import func, or_

    stmt = (
        select(func.count())
        .select_from(WebhookDelivery)
        .where(
            or_(
                WebhookDelivery.status_code.is_(None),
                WebhookDelivery.status_code < 200,
                WebhookDelivery.status_code >= 300,
            )
        )
    )
    result = await db.execute(stmt)
    return int(result.scalar_one())
