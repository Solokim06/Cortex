"""
Ticket event log — append-only audit trail.

Every meaningful action on a ticket writes one row here. This powers:
  - the admin activity timeline
  - SLA math (knowing when the first team reply actually happened)
  - impersonation auditing
  - webhook dispatch (each event can fan out)

Never update or delete rows from this table. It's a log.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TicketEvent


# ---------------------------------------------------------------------
# Event kinds — keep this list in sync with what routers/services write
# ---------------------------------------------------------------------

KIND_CREATED = "created"
KIND_STATUS_CHANGED = "status_changed"
KIND_PRIORITY_CHANGED = "priority_changed"
KIND_ASSIGNED = "assigned"
KIND_REPLIED = "replied"
KIND_NOTE_ADDED = "note_added"
KIND_TAG_ADDED = "tag_added"
KIND_TAG_REMOVED = "tag_removed"
KIND_IMPERSONATED_ACTION = "impersonated_action"
KIND_SLA_RECOMPUTED = "sla_recomputed"
KIND_SLA_BREACHED = "sla_breached"
KIND_USER_REDACTED = "user_redacted"
KIND_CONVERSATION_ATTACHED = "conversation_attached"
KIND_REPLY_EDITED = "reply_edited"

ALL_KINDS = {
    KIND_CREATED,
    KIND_STATUS_CHANGED,
    KIND_PRIORITY_CHANGED,
    KIND_ASSIGNED,
    KIND_REPLIED,
    KIND_NOTE_ADDED,
    KIND_TAG_ADDED,
    KIND_TAG_REMOVED,
    KIND_IMPERSONATED_ACTION,
    KIND_SLA_RECOMPUTED,
    KIND_SLA_BREACHED,
    KIND_USER_REDACTED,
    KIND_CONVERSATION_ATTACHED,
    KIND_REPLY_EDITED,
}


# ---------------------------------------------------------------------
# actor kinds
# ---------------------------------------------------------------------

ACTOR_USER = "user"
ACTOR_TEAM = "team"
ACTOR_SYSTEM = "system"


# ---------------------------------------------------------------------
# append
# ---------------------------------------------------------------------


async def log_event(
    db: AsyncSession,
    *,
    ticket_id: str,
    kind: str,
    actor_kind: str = ACTOR_SYSTEM,
    actor_user_id: str | None = None,
    data: dict | None = None,
    commit: bool = True,
) -> TicketEvent:
    """
    Append one event to the log.

    Callers usually don't need to commit immediately — but by default we
    do, so the event is durable even if a later call in the same request
    fails. Pass commit=False if you're batching multiple events.
    """
    if kind not in ALL_KINDS:
        raise ValueError(f"Unknown ticket event kind: {kind}")

    event = TicketEvent(
        id=str(uuid4()),
        ticket_id=ticket_id,
        actor_user_id=actor_user_id,
        actor_kind=actor_kind,
        kind=kind,
        data=data or {},
    )
    db.add(event)

    if commit:
        await db.commit()
        await db.refresh(event)

    return event


# ---------------------------------------------------------------------
# query
# ---------------------------------------------------------------------


async def list_events(
    db: AsyncSession,
    ticket_id: str,
    *,
    limit: int = 200,
    offset: int = 0,
    include_system: bool = True,
) -> list[TicketEvent]:
    """
    Return events for a ticket, oldest first (timeline order).

    `include_system=False` filters out noisy system events like
    sla_recomputed — useful for a user-visible timeline.
    """
    stmt = select(TicketEvent).where(TicketEvent.ticket_id == ticket_id)

    if not include_system:
        stmt = stmt.where(TicketEvent.actor_kind != ACTOR_SYSTEM)

    stmt = (
        stmt.order_by(TicketEvent.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------
# serialization
# ---------------------------------------------------------------------


def event_to_dict(e: TicketEvent) -> dict:
    """JSON-safe representation for API responses."""
    return {
        "id": str(e.id),
        "ticket_id": str(e.ticket_id),
        "kind": e.kind,
        "actor_kind": e.actor_kind,
        "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
        "data": e.data or {},
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def latest_first_response_at(events: list[TicketEvent]) -> datetime | None:
    """
    Convenience for SLA math — first event of kind='replied' with
    actor_kind='team'. Returns None if no team reply yet.
    """
    for e in events:
        if e.kind == KIND_REPLIED and e.actor_kind == ACTOR_TEAM:
            return e.created_at
    return None
