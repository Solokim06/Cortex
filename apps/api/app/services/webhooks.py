"""
Outbound webhooks.

Dispatch flow:
  1. A ticket event happens (created, status_changed, replied, ...)
  2. Something calls `dispatch(db, event_kind=..., ticket=..., extra=...)`
  3. We find every active WebhookTarget whose `events` list contains
     the event kind OR "*"
  4. For each target, POST a JSON payload with an HMAC signature header
  5. Record one WebhookDelivery row per attempt
  6. On failure, record the failure. Retry is the caller's problem for
     now — a background retry job can be added later by scanning
     webhook_deliveries where status_code is NULL or >= 400.

Fire-and-forget: `dispatch()` never raises. Failures are logged and
recorded. Callers should not depend on delivery success.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import FeedbackTicket, WebhookDelivery, WebhookTarget

# ---------------------------------------------------------------------
# event kinds that can trigger webhooks
# ---------------------------------------------------------------------

EVENT_TICKET_CREATED = "ticket.created"
EVENT_TICKET_STATUS_CHANGED = "ticket.status_changed"
EVENT_TICKET_PRIORITY_CHANGED = "ticket.priority_changed"
EVENT_TICKET_ASSIGNED = "ticket.assigned"
EVENT_TICKET_REPLIED = "ticket.replied"
EVENT_TICKET_RESOLVED = "ticket.resolved"
EVENT_TICKET_NOTE_ADDED = "ticket.note_added"
EVENT_TICKET_SLA_BREACHED_FIRST_RESPONSE = "ticket.sla_breached.first_response"
EVENT_TICKET_SLA_BREACHED_RESOLUTION = "ticket.sla_breached.resolution"

ALL_EVENTS = {
    EVENT_TICKET_CREATED,
    EVENT_TICKET_STATUS_CHANGED,
    EVENT_TICKET_PRIORITY_CHANGED,
    EVENT_TICKET_ASSIGNED,
    EVENT_TICKET_REPLIED,
    EVENT_TICKET_RESOLVED,
    EVENT_TICKET_NOTE_ADDED,
    EVENT_TICKET_SLA_BREACHED_FIRST_RESPONSE,
    EVENT_TICKET_SLA_BREACHED_RESOLUTION,
}

HTTP_TIMEOUT_SECONDS = 10.0


# ---------------------------------------------------------------------
# target management
# ---------------------------------------------------------------------


async def list_targets(db: AsyncSession) -> list[WebhookTarget]:
    result = await db.execute(
        select(WebhookTarget).order_by(WebhookTarget.created_at.desc())
    )
    return list(result.scalars().all())


async def get_target(db: AsyncSession, target_id: str) -> WebhookTarget | None:
    result = await db.execute(
        select(WebhookTarget).where(WebhookTarget.id == target_id)
    )
    return result.scalar_one_or_none()


async def create_target(
    db: AsyncSession,
    *,
    name: str,
    url: str,
    events: list[str] | None = None,
    secret: str | None = None,
    created_by_user_id: str | None = None,
) -> WebhookTarget:
    """Create a new webhook target. events defaults to ['*']."""
    target = WebhookTarget(
        id=str(uuid4()),
        name=name.strip()[:120],
        url=url.strip(),
        secret=(secret or "").strip() or None,
        events=events or ["*"],
        is_active=True,
        created_by=created_by_user_id,
    )
    db.add(target)
    await db.commit()
    await db.refresh(target)
    return target


async def update_target(
    db: AsyncSession,
    target_id: str,
    *,
    name: str | None = None,
    url: str | None = None,
    events: list[str] | None = None,
    secret: str | None = None,
    is_active: bool | None = None,
) -> WebhookTarget | None:
    target = await get_target(db, target_id)
    if target is None:
        return None

    if name is not None:
        target.name = name.strip()[:120]
    if url is not None:
        target.url = url.strip()
    if events is not None:
        target.events = events
    if secret is not None:
        target.secret = secret.strip() or None
    if is_active is not None:
        target.is_active = is_active

    await db.commit()
    await db.refresh(target)
    return target


async def delete_target(db: AsyncSession, target_id: str) -> bool:
    target = await get_target(db, target_id)
    if target is None:
        return False
    await db.delete(target)
    await db.commit()
    return True


# ---------------------------------------------------------------------
# matching
# ---------------------------------------------------------------------


def _target_matches(target: WebhookTarget, event_kind: str) -> bool:
    if not target.is_active:
        return False
    events = target.events or []
    if not isinstance(events, list):
        return False
    return "*" in events or event_kind in events


async def _matching_targets(
    db: AsyncSession,
    event_kind: str,
) -> list[WebhookTarget]:
    result = await db.execute(
        select(WebhookTarget).where(WebhookTarget.is_active.is_(True))
    )
    return [t for t in result.scalars().all() if _target_matches(t, event_kind)]


# ---------------------------------------------------------------------
# signing
# ---------------------------------------------------------------------


def _sign(body: bytes, secret: str) -> str:
    """HMAC-SHA256 hex digest, prefixed with 'sha256='."""
    mac = hmac.new(secret.encode("utf-8"), body, hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def _effective_secret(target: WebhookTarget) -> str | None:
    return target.secret or settings.webhook_signing_secret or None


# ---------------------------------------------------------------------
# payload building
# ---------------------------------------------------------------------


def _ticket_snapshot(ticket: FeedbackTicket) -> dict:
    return {
        "id": str(ticket.id),
        "user_id": str(ticket.user_id),
        "category": ticket.category,
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "assigned_to_user_id": (
            str(ticket.assigned_to_user_id)
            if ticket.assigned_to_user_id
            else None
        ),
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
    }


def _build_payload(
    event_kind: str,
    ticket: FeedbackTicket | None,
    extra: dict | None,
) -> dict:
    return {
        "event": event_kind,
        "emitted_at": datetime.now(timezone.utc).isoformat(),
        "ticket": _ticket_snapshot(ticket) if ticket else None,
        "data": extra or {},
    }


# ---------------------------------------------------------------------
# dispatch
# ---------------------------------------------------------------------


async def dispatch(
    db: AsyncSession,
    *,
    event_kind: str,
    ticket: FeedbackTicket | None = None,
    extra: dict | None = None,
    commit: bool = True,
) -> list[WebhookDelivery]:
    """
    Fire-and-forget dispatch to all matching active targets.

    Never raises. Returns the list of WebhookDelivery rows created
    (one per target, with attempt=1). Failure details are stored on the
    delivery row; retries are handled elsewhere.
    """
    if event_kind not in ALL_EVENTS:
        # Silently ignore unknown events rather than 500 the caller
        return []

    try:
        targets = await _matching_targets(db, event_kind)
    except Exception as e:  # noqa: BLE001
        print(f"[webhooks] target lookup failed for {event_kind}: {e}")
        return []

    if not targets:
        return []

    payload = _build_payload(event_kind, ticket, extra)
    body = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")

    deliveries: list[WebhookDelivery] = []

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        for target in targets:
            delivery = await _deliver_one(
                db,
                client=client,
                target=target,
                event_kind=event_kind,
                ticket=ticket,
                body=body,
                payload=payload,
                attempt=1,
            )
            deliveries.append(delivery)

    if commit:
        try:
            await db.commit()
            for d in deliveries:
                await db.refresh(d)
        except Exception as e:  # noqa: BLE001
            # Never let audit-log persistence kill the caller. The HTTP
            # dispatch already happened; if we can't record it, log and
            # move on. This is best-effort bookkeeping.
            print(f"[webhooks] failed to persist deliveries: {e}")
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass

    return deliveries


async def _deliver_one(
    db: AsyncSession,
    *,
    client: httpx.AsyncClient,
    target: WebhookTarget,
    event_kind: str,
    ticket: FeedbackTicket | None,
    body: bytes,
    payload: dict,
    attempt: int,
) -> WebhookDelivery:
    """
    Make one HTTP POST and record the result. Never raises.
    """
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Cortex-Webhooks/1.0",
        "X-Cortex-Event": event_kind,
        "X-Cortex-Delivery": str(uuid4()),
        "X-Cortex-Attempt": str(attempt),
    }

    secret = _effective_secret(target)
    if secret:
        headers["X-Cortex-Signature"] = _sign(body, secret)

    status_code: int | None = None
    response_body: str | None = None

    try:
        resp = await client.post(target.url, content=body, headers=headers)
        status_code = resp.status_code
        text = resp.text or ""
        response_body = text[:2000]
    except httpx.HTTPError as e:
        response_body = f"HTTPError: {e}"[:2000]
    except Exception as e:  # noqa: BLE001
        response_body = f"Error: {e}"[:2000]

    delivery = WebhookDelivery(
        id=str(uuid4()),
        target_id=target.id,
        event_kind=event_kind,
        ticket_id=str(ticket.id) if ticket else None,
        payload=payload,
        status_code=status_code,
        response_body=response_body,
        attempt=attempt,
    )
    db.add(delivery)

    # Update target bookkeeping
    target.last_status_code = status_code
    target.last_delivery_at = datetime.now(timezone.utc)

    success = status_code is not None and 200 <= status_code < 300
    if success:
        target.failure_count = 0
    else:
        target.failure_count = (target.failure_count or 0) + 1

    return delivery


# ---------------------------------------------------------------------
# test endpoint helper
# ---------------------------------------------------------------------


async def test_target(
    db: AsyncSession,
    target_id: str,
) -> WebhookDelivery | None:
    """
    Send a synthetic "ping" event to a target. Used by the admin
    "Test webhook" button.
    """
    target = await get_target(db, target_id)
    if target is None:
        return None

    payload = {
        "event": "ping",
        "emitted_at": datetime.now(timezone.utc).isoformat(),
        "ticket": None,
        "data": {"message": "Cortex webhook test"},
    }
    body = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        delivery = await _deliver_one(
            db,
            client=client,
            target=target,
            event_kind="ping",
            ticket=None,
            body=body,
            payload=payload,
            attempt=1,
        )

    await db.commit()
    await db.refresh(delivery)
    return delivery


# ---------------------------------------------------------------------
# delivery history
# ---------------------------------------------------------------------


async def list_deliveries(
    db: AsyncSession,
    target_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[WebhookDelivery]:
    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.target_id == target_id)
        .order_by(WebhookDelivery.delivered_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------
# bootstrap: seed from settings.webhook_urls if table is empty
# ---------------------------------------------------------------------


async def seed_from_settings(db: AsyncSession) -> int:
    """
    If no targets exist and settings.webhook_urls is non-empty, create one
    generic target per URL subscribed to '*'. Returns number created.
    Called on app startup.
    """
    existing = await list_targets(db)
    if existing:
        return 0

    urls = settings.webhook_url_list
    if not urls:
        return 0

    created = 0
    for i, url in enumerate(urls, start=1):
        target = WebhookTarget(
            id=str(uuid4()),
            name=f"Default target {i}",
            url=url,
            secret=None,
            events=["*"],
            is_active=True,
        )
        db.add(target)
        created += 1

    if created:
        await db.commit()

    return created


# ---------------------------------------------------------------------
# serialization
# ---------------------------------------------------------------------


def target_to_dict(t: WebhookTarget) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "url": t.url,
        "events": t.events or [],
        "is_active": t.is_active,
        "has_secret": bool(t.secret),
        "last_status_code": t.last_status_code,
        "last_delivery_at": (
            t.last_delivery_at.isoformat() if t.last_delivery_at else None
        ),
        "failure_count": t.failure_count or 0,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def delivery_to_dict(d: WebhookDelivery) -> dict:
    return {
        "id": str(d.id),
        "target_id": str(d.target_id),
        "event_kind": d.event_kind,
        "ticket_id": str(d.ticket_id) if d.ticket_id else None,
        "status_code": d.status_code,
        "response_body": d.response_body,
        "attempt": d.attempt,
        "delivered_at": d.delivered_at.isoformat() if d.delivered_at else None,
    }
