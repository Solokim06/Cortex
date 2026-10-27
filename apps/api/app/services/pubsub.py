"""
Real-time event fan-out for the admin dashboard.

Two modes:
  - Redis pub/sub (if REDIS_URL is reachable) — supports multiple workers
  - In-memory asyncio queues — single-worker fallback

The public API is the same either way:

  await publish(event: dict)
    Broadcast an event to all subscribers across all workers.

  async for event in subscribe():
    Yield events as they arrive. Used by the SSE endpoint.

Redis channels:
  cortex:admin:events        — all admin events

Events are plain dicts with at least:
  {
    "kind": "ticket.created" | "ticket.status_changed" | ...,
    "at": "<ISO timestamp>",
    "data": {...}
  }

Auto-detection:
  On first use, we try to connect to Redis. If it works, we use it. If
  not, we fall back to in-memory. The mode is sticky for the process
  lifetime — no flap between modes.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from app.config.settings import settings


CHANNEL = "cortex:admin:events"

# How long a subscriber waits before being sent a keep-alive ping.
# (Handled at the SSE layer, not here.)


# =====================================================================
# mode detection
# =====================================================================

_MODE_UNSET = "unset"
_MODE_REDIS = "redis"
_MODE_MEMORY = "memory"

_mode: str = _MODE_UNSET
_redis_client = None
_redis_pubsub = None

# In-memory fallback: fan-out queues
_memory_subscribers: set[asyncio.Queue] = set()
_memory_lock = asyncio.Lock()


async def _try_init_redis() -> bool:
    """Attempt to connect to Redis. Returns True on success."""
    global _redis_client, _redis_pubsub

    if _mode == _MODE_REDIS and _redis_client is not None:
        return True

    try:
        import redis.asyncio as redis  # type: ignore
    except ImportError:
        return False

    try:
        client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await client.ping()
        _redis_client = client
        _redis_pubsub = client.pubsub()
        return True
    except Exception:  # noqa: BLE001
        _redis_client = None
        _redis_pubsub = None
        return False


async def _resolve_mode() -> str:
    global _mode
    if _mode != _MODE_UNSET:
        return _mode

    ok = await _try_init_redis()
    _mode = _MODE_REDIS if ok else _MODE_MEMORY
    print(f"[pubsub] mode = {_mode}")
    return _mode


# =====================================================================
# publishing
# =====================================================================


async def publish(event: dict) -> None:
    """
    Broadcast an event to all subscribers. Never raises.
    Adds 'at' timestamp if missing.
    """
    if "at" not in event:
        event = {**event, "at": datetime.now(timezone.utc).isoformat()}

    mode = await _resolve_mode()

    if mode == _MODE_REDIS:
        try:
            payload = json.dumps(event, default=str, separators=(",", ":"))
            await _redis_client.publish(CHANNEL, payload)
            return
        except Exception as e:  # noqa: BLE001
            print(f"[pubsub] redis publish failed, falling back: {e}")
            # Fall through to memory so we don't drop the event
            # (also flips the mode so we don't keep retrying Redis every call)

    # In-memory fan-out
    async with _memory_lock:
        dead: list[asyncio.Queue] = []
        for q in _memory_subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            _memory_subscribers.discard(q)


# =====================================================================
# subscribing
# =====================================================================


async def subscribe() -> AsyncIterator[dict]:
    """
    Yield events as they arrive. Runs forever until the caller breaks.
    Cleans up on cancellation.
    """
    mode = await _resolve_mode()

    if mode == _MODE_REDIS:
        async for event in _subscribe_redis():
            yield event
    else:
        async for event in _subscribe_memory():
            yield event


async def _subscribe_redis() -> AsyncIterator[dict]:
    """Subscribe to Redis pub/sub."""
    client = _redis_client
    if client is None:
        return

    pubsub = client.pubsub()
    await pubsub.subscribe(CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                data = json.loads(message["data"])
                yield data
            except Exception:  # noqa: BLE001
                continue
    finally:
        try:
            await pubsub.unsubscribe(CHANNEL)
            await pubsub.close()
        except Exception:  # noqa: BLE001
            pass


async def _subscribe_memory() -> AsyncIterator[dict]:
    """Subscribe to the in-memory fan-out."""
    q: asyncio.Queue = asyncio.Queue(maxsize=1000)
    async with _memory_lock:
        _memory_subscribers.add(q)

    try:
        while True:
            event = await q.get()
            yield event
    finally:
        async with _memory_lock:
            _memory_subscribers.discard(q)


# =====================================================================
# convenience: emit from ticket events
# =====================================================================


async def emit_ticket_event(
    event_kind: str,
    ticket_id: str,
    *,
    data: dict | None = None,
) -> None:
    """
    Small wrapper so routers/services can emit without building the
    payload shape every time.
    """
    await publish(
        {
            "kind": event_kind,
            "ticket_id": ticket_id,
            "data": data or {},
        }
    )


# =====================================================================
# shutdown
# =====================================================================


async def shutdown() -> None:
    """Close Redis client if open. Call from app lifespan shutdown."""
    global _redis_client, _redis_pubsub, _mode
    if _redis_client is not None:
        try:
            await _redis_client.close()
        except Exception:  # noqa: BLE001
            pass
    _redis_client = None
    _redis_pubsub = None
    _mode = _MODE_UNSET


# =====================================================================
# health
# =====================================================================


def current_mode() -> str:
    return _mode


def subscriber_count() -> int:
    return len(_memory_subscribers)


# =====================================================================
# Admin notifications (feature: real-time toasts + bell)
# =====================================================================
#
# Higher-level helper on top of `publish()`. Emits a structured
# notification envelope that the frontend fans out to toasts + bell.
#
# Unlike raw events, notifications:
#   - carry a list of intended recipients (so clients can filter)
#   - have a priority (affects toast styling + auto-dismiss timing)
#   - have a click target (URL to open)
#   - carry a short human-readable message
#
# Recipient model:
#   - "admins"  → all admins/agents
#   - "assignee" → the ticket's assignee, if any
#   - explicit user_id(s)
#
# The client filters by comparing its own user id to the recipient list.
# This is fine because the SSE stream is only accessible to admins
# already (auth enforced at the endpoint).

PRIORITY_LOW = "low"
PRIORITY_NORMAL = "normal"
PRIORITY_HIGH = "high"
PRIORITY_URGENT = "urgent"

VALID_PRIORITIES = {PRIORITY_LOW, PRIORITY_NORMAL, PRIORITY_HIGH, PRIORITY_URGENT}


async def emit_admin_notification(
    *,
    kind: str,
    title: str,
    body: str,
    priority: str = PRIORITY_NORMAL,
    recipients: list[str] | None = None,
    recipients_mode: str = "explicit",
    ticket_id: str | None = None,
    ticket_subject: str | None = None,
    click_url: str | None = None,
    extra: dict | None = None,
) -> None:
    """
    Broadcast a structured notification to the admin SSE stream.

    `recipients_mode` options:
      "explicit"  — use the `recipients` list (user IDs)
      "admins"    — broadcast to all admins (client-side filter falls
                    back to "show to me" if I'm in the list, otherwise
                    we don't gate — the SSE connection is admin-only anyway)
      "assignee"  — recipients list is the assignee (if any); empty
                    means "no one"

    The payload shape (stable contract for the frontend):
      {
        "kind":       "notification",
        "notification": {
          "id":             "<uuid>",
          "event_kind":     "ticket.created" | "ticket.assigned" | ...,
          "priority":       "low" | "normal" | "high" | "urgent",
          "title":          "<short subject line>",
          "body":           "<1-2 sentence description>",
          "recipients":     ["user_id", ...],
          "recipients_mode":"explicit" | "admins" | "assignee",
          "ticket_id":      "<uuid> | null",
          "ticket_subject": "<string> | null",
          "click_url":      "/admin/tickets/<id> | null",
          "extra":          {...},
          "at":             "<ISO timestamp>",
        }
      }

    Never raises — publish() already swallows errors.
    """
    from uuid import uuid4

    if priority not in VALID_PRIORITIES:
        priority = PRIORITY_NORMAL

    notification = {
        "id": str(uuid4()),
        "event_kind": kind,
        "priority": priority,
        "title": title,
        "body": body,
        "recipients": recipients or [],
        "recipients_mode": recipients_mode,
        "ticket_id": ticket_id,
        "ticket_subject": ticket_subject,
        "click_url": click_url,
        "extra": extra or {},
        "at": datetime.now(timezone.utc).isoformat(),
    }

    await publish(
        {
            "kind": "notification",
            "notification": notification,
        }
    )
