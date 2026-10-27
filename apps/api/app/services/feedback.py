"""
Help & Feedback — feedback ticket service.

Public API (Phase 1):
  - create_ticket, list_tickets, get_ticket, list_replies
  - add_user_reply, add_team_reply, update_status
  - ticket_summary, ticket_detail

Admin API (Tier 3 / Wave A):
  - list_all_tickets, count_tickets, get_ticket_any
  - ticket_admin_detail, ticket_admin_summary
  - admin_status_change, set_priority, assign_ticket
  - add_team_reply_with_event, add_note
  - add_tag, remove_tag, list_tags, list_all_tags
  - admin_stats
  - macros CRUD (list_all_macros, get_macro, create_macro, update_macro, delete_macro)

Wave B additions:
  - search_tickets              full-text search over subject/description/replies
  - bulk_update                 apply status/priority/assign/tag to many tickets
  - reply_with_macro            render a macro and post it as a team reply
  - render_macro                substitute {{var}} placeholders
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    CannedResponse,
    FeedbackReply,
    FeedbackTicket,
    TicketTag,
    User,
)
from app.services import notifications as notifications_service
from app.services import pubsub as pubsub_service
from app.services import sla as sla_service
from app.services import ticket_events as events_service
from app.services import webhooks as webhooks_service


VALID_CATEGORIES = {"bug", "feature", "question", "other"}
VALID_STATUSES = {"open", "in_progress", "resolved", "closed"}
VALID_PRIORITIES = {"low", "normal", "high", "urgent"}


# =====================================================================
# PUBLIC API (Phase 1 — unchanged behavior)
# =====================================================================


async def create_ticket(
    db: AsyncSession,
    user_id: str | None,
    category: str,
    subject: str,
    description: str,
    context: dict | None = None,
    attachment_url: str | None = None,
    priority: str = "normal",
    conversation: list[dict] | None = None,
) -> FeedbackTicket:
    """
    Create a new feedback ticket.

    `conversation` — optional list of {role, content, created_at} dicts,
    typically the last N messages of a chat the user is escalating from.
    Capped at 100 messages. Stored in context.attached_conversation.
    """
    if category not in VALID_CATEGORIES:
        category = "other"
    if priority not in VALID_PRIORITIES:
        priority = "normal"

    # Merge conversation into context (not a separate column — keeps it
    # queryable without a schema change and easy to prune later).
    ctx = dict(context or {})
    if conversation:
        # Cap + sanitize — never trust client-supplied shapes blindly
        cleaned = []
        for m in conversation[:100]:
            if not isinstance(m, dict):
                continue
            role = str(m.get("role") or "").strip()
            content = str(m.get("content") or "").strip()
            created_at = str(m.get("created_at") or "").strip()
            if role not in ("user", "assistant") or not content:
                continue
            cleaned.append({
                "role": role,
                "content": content[:4000],
                "created_at": created_at,
            })
        if cleaned:
            ctx["attached_conversation"] = cleaned

    ticket = FeedbackTicket(
        id=str(uuid.uuid4()),
        user_id=user_id,
        category=category,
        subject=subject.strip()[:200],
        description=description.strip(),
        context=ctx,
        attachment_url=attachment_url,
        status="open",
        priority=priority,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)

    await sla_service.apply_sla_to_ticket(db, ticket, commit=False)

    # Fire-and-forget: AI triage + optional auto-reply.
    # Wrapped so a scheduling error never breaks ticket creation.
    try:
        from app.services import triage as _triage_service
        _triage_service.schedule_triage_pipeline(str(ticket.id))
    except Exception as _e:  # noqa: BLE001
        print(f"[feedback] triage schedule failed: {_e}")

    created_data: dict = {"category": category, "priority": priority}
    if conversation:
        created_data["has_attached_conversation"] = True
        created_data["attached_message_count"] = len(
            ctx.get("attached_conversation") or []
        )

    await events_service.log_event(
        db,
        ticket_id=ticket.id,
        kind=events_service.KIND_CREATED,
        actor_kind=events_service.ACTOR_USER,
        actor_user_id=user_id,
        data=created_data,
        commit=False,
    )

    await db.commit()
    await db.refresh(ticket)

    await webhooks_service.dispatch(
        db,
        event_kind=webhooks_service.EVENT_TICKET_CREATED,
        ticket=ticket,
    )

    # Email notifications (fire-and-forget)
    # Only notify the ticket owner when there IS one. Anonymous tickets
    # have no user row — the notification service would fail on the UUID lookup.
    if user_id:
        try:
            await notifications_service.notify_new_ticket(
                db, ticket, skip_user_id=user_id
            )
        except Exception as e:  # noqa: BLE001
            print(f"[feedback] notify_new_ticket failed: {e}")

    # Real-time admin notification (in-app toast + bell)
    try:
        # Anonymous tickets have user_id=None. The ticket still notifies
        # admins — we just can't look up a filer name.
        if user_id:
            filer = await get_user_by_id(db, user_id)
            filer_label = (filer.name or filer.email) if filer else "Someone"
        else:
            ctx = ticket.context or {}
            email = ctx.get("contact_email")
            filer_label = f"Anonymous ({email})" if email else "Anonymous"
        await pubsub_service.emit_admin_notification(
            kind="ticket.created",
            title=f"New ticket: {ticket.subject[:80]}",
            body=f"Filed by {filer_label}",
            priority="normal",
            recipients_mode="admins",
            ticket_id=str(ticket.id),
            ticket_subject=ticket.subject,
            click_url=f"/admin/tickets/{ticket.id}",
            extra={"category": ticket.category, "priority": ticket.priority},
        )
    except Exception as e:  # noqa: BLE001
        print(f"[feedback] emit ticket.created failed: {e}")

    return ticket


async def list_tickets(
    db: AsyncSession,
    user_id: str,
    limit: int = 50,
) -> list[FeedbackTicket]:
    result = await db.execute(
        select(FeedbackTicket)
        .where(FeedbackTicket.user_id == user_id)
        .order_by(FeedbackTicket.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_ticket(
    db: AsyncSession,
    user_id: str,
    ticket_id: str,
) -> FeedbackTicket | None:
    result = await db.execute(
        select(FeedbackTicket)
        .where(FeedbackTicket.id == ticket_id)
        .where(FeedbackTicket.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_replies(
    db: AsyncSession,
    ticket_id: str,
) -> list[FeedbackReply]:
    """User-visible replies only (excludes internal notes)."""
    result = await db.execute(
        select(FeedbackReply)
        .where(FeedbackReply.ticket_id == ticket_id)
        .where(FeedbackReply.author != "note")
        .order_by(FeedbackReply.created_at.asc())
    )
    return list(result.scalars().all())


async def add_user_reply(
    db: AsyncSession,
    user_id: str,
    ticket_id: str,
    content: str,
) -> FeedbackReply | None:
    ticket = await get_ticket(db, user_id, ticket_id)
    if ticket is None:
        return None

    reply = FeedbackReply(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author="user",
        content=content.strip(),
    )
    db.add(reply)

    # Un-hide on user reply — admins should see the fresh activity.
    if ticket.hidden_from_admin_at is not None:
        ticket.hidden_from_admin_at = None

    if ticket.status in ("resolved", "closed"):
        ticket.status = "open"
        ticket.resolved_at = None

    ticket.last_replied_by = "user"

    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_REPLIED,
        actor_kind=events_service.ACTOR_USER,
        actor_user_id=user_id,
        data={"reply_id": reply.id},
        commit=False,
    )

    await db.commit()
    await db.refresh(reply)
    await db.refresh(ticket)

    await webhooks_service.dispatch(
        db,
        event_kind=webhooks_service.EVENT_TICKET_REPLIED,
        ticket=ticket,
        extra={"reply_id": reply.id, "author": "user"},
    )

    # Notify the assignee (or admins if unassigned) about the reply
    try:
        await notifications_service.notify_user_reply(
            db,
            ticket,
            reply_content=reply.content,
            reply_author_user_id=user_id,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[feedback] notify_user_reply failed: {e}")

    # Real-time admin notification
    try:
        filer = await get_user_by_id(db, user_id)
        filer_label = (filer.name or filer.email) if filer else "User"
        if ticket.assigned_to_user_id:
            recipients = [str(ticket.assigned_to_user_id)]
            recipients_mode = "assignee"
        else:
            recipients = []
            recipients_mode = "admins"
        await pubsub_service.emit_admin_notification(
            kind="ticket.user_replied",
            title=f"Reply from {filer_label}",
            body=reply.content[:140] + ("..." if len(reply.content) > 140 else ""),
            priority="normal",
            recipients=recipients,
            recipients_mode=recipients_mode,
            ticket_id=str(ticket.id),
            ticket_subject=ticket.subject,
            click_url=f"/admin/tickets/{ticket.id}",
        )
    except Exception as e:  # noqa: BLE001
        print(f"[feedback] emit ticket.user_replied failed: {e}")

    # Re-run the AI pipeline with the new conversation context.
    # Debounced + non-blocking so a fast-replying user doesn't spam the LLM.
    try:
        from app.services import triage as _triage_service
        _triage_service.schedule_triage_pipeline(str(ticket.id), force=True)
    except Exception as e:  # noqa: BLE001
        print(f"[feedback] triage re-schedule failed: {e}")

    return reply


# =====================================================================
# EDITABLE REPLIES — filer can edit their own reply within a window
# =====================================================================

REPLY_EDIT_WINDOW_MINUTES = 30


async def edit_reply(
    db: AsyncSession,
    user_id: str,
    ticket_id: str,
    reply_id: str,
    new_content: str,
) -> dict:
    """
    Edit a user reply. Rules:
      - Only the reply's author can edit it (must own the ticket).
      - Only within REPLAY_EDIT_WINDOW_MINUTES of created_at.
      - Only "user"-authored replies (admins/notes cannot be edited by the filer).
      - Records before/after in the ticket event log.

    Returns {"ok": bool, "reason": str, "reply": dict | None}
    """
    # Verify the ticket belongs to the user
    ticket = await get_ticket(db, user_id, ticket_id)
    if ticket is None:
        return {"ok": False, "reason": "ticket_not_found"}

    # Fetch the reply
    result = await db.execute(
        select(FeedbackReply).where(
            FeedbackReply.id == reply_id,
            FeedbackReply.ticket_id == ticket_id,
        )
    )
    reply = result.scalar_one_or_none()
    if reply is None:
        return {"ok": False, "reason": "reply_not_found"}

    # Author-only guard
    if reply.author != "user":
        return {"ok": False, "reason": "not_editable"}

    # Edit window guard
    now = datetime.now(timezone.utc)
    created = reply.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    age_min = (now - created).total_seconds() / 60.0
    if age_min > REPLY_EDIT_WINDOW_MINUTES:
        return {"ok": False, "reason": "edit_window_expired"}

    clean = (new_content or "").strip()
    if not clean:
        return {"ok": False, "reason": "empty_content"}
    if clean == reply.content:
        # No-op; return OK without an event
        return {
            "ok": True,
            "reason": "unchanged",
            "reply": {
                "id": reply.id,
                "content": reply.content,
                "edited_at": (
                    reply.edited_at.isoformat() if reply.edited_at else None
                ),
                "created_at": reply.created_at.isoformat(),
            },
        }

    before = reply.content
    reply.content = clean
    reply.edited_at = now
    await db.commit()
    await db.refresh(reply)

    # Log an event with before/after for audit
    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_REPLY_EDITED,
        actor_kind=events_service.ACTOR_USER,
        actor_user_id=user_id,
        data={
            "reply_id": reply.id,
            "before": before[:2000],
            "after": clean[:2000],
        },
        commit=False,
    )
    await db.commit()

    return {
        "ok": True,
        "reply": {
            "id": reply.id,
            "content": reply.content,
            "edited_at": reply.edited_at.isoformat() if reply.edited_at else None,
            "created_at": reply.created_at.isoformat(),
        },
    }


async def add_team_reply(
    db: AsyncSession,
    ticket_id: str,
    content: str,
) -> FeedbackReply | None:
    """Legacy helper — prefer add_team_reply_with_event."""
    reply = FeedbackReply(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author="team",
        content=content.strip(),
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return reply


async def update_status(
    db: AsyncSession,
    ticket_id: str,
    status: str,
) -> FeedbackTicket | None:
    """Legacy helper — prefer admin_status_change."""
    if status not in VALID_STATUSES:
        return None

    result = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return None

    ticket.status = status
    if status in ("resolved", "closed"):
        ticket.resolved_at = datetime.now(timezone.utc)
    else:
        ticket.resolved_at = None

    await db.commit()
    await db.refresh(ticket)
    return ticket


def ticket_summary(t: FeedbackTicket) -> dict:
    return {
        "id": str(t.id),
        "category": t.category,
        "subject": t.subject,
        "status": t.status,
        "priority": t.priority,
        "hidden_from_admin_at": (
            t.hidden_from_admin_at.isoformat()
            if t.hidden_from_admin_at
            else None
        ),
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
    }


def ticket_detail(t: FeedbackTicket, replies: list[FeedbackReply]) -> dict:
    ctx = t.context or {}
    attached = ctx.get("attached_conversation") or []

    # Strip the attached conversation from the raw `context` we send to
    # the user — we surface it separately as `attached_conversation` so
    # the frontend doesn't have to dig through a JSON blob.
    public_context = {
        k: v for k, v in ctx.items() if k != "attached_conversation"
    }

    return {
        "id": str(t.id),
        "category": t.category,
        "subject": t.subject,
        "description": t.description,
        "context": public_context,
        "attached_conversation": attached,
        "attachment_url": t.attachment_url,
        "status": t.status,
        "priority": t.priority,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "replies": [
            {
                "id": str(r.id),
                "author": r.author,
                "content": r.content,
                "created_at": r.created_at.isoformat(),
                "edited_at": (
                    r.edited_at.isoformat() if r.edited_at else None
                ),
            }
            for r in replies
        ],
    }


# =====================================================================
# ADMIN API (Tier 3 / Wave A)
# =====================================================================


async def list_all_tickets(
    db: AsyncSession,
    *,
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    assigned_to_user_id: str | None = None,
    unassigned: bool = False,
    search: str | None = None,
    tag: str | None = None,
    breached: bool | None = None,
    sort: str = "updated_desc",
    limit: int = 50,
    offset: int = 0,
    # Soft-delete visibility:
    #   None      → exclude hidden (default view)
    #   True      → show ONLY hidden (cleared view)
    #   False     → include everything
    show_hidden: bool | None = None,
) -> list[FeedbackTicket]:
    stmt = select(FeedbackTicket)

    if show_hidden is None:
        stmt = stmt.where(FeedbackTicket.hidden_from_admin_at.is_(None))
    elif show_hidden is True:
        stmt = stmt.where(FeedbackTicket.hidden_from_admin_at.is_not(None))
    # else: show_hidden=False → no filter

    if show_hidden is None:
        stmt = stmt.where(FeedbackTicket.hidden_from_admin_at.is_(None))
    elif show_hidden is True:
        stmt = stmt.where(FeedbackTicket.hidden_from_admin_at.is_not(None))

    if status and status in VALID_STATUSES:
        stmt = stmt.where(FeedbackTicket.status == status)
    if priority and priority in VALID_PRIORITIES:
        stmt = stmt.where(FeedbackTicket.priority == priority)
    if category and category in VALID_CATEGORIES:
        stmt = stmt.where(FeedbackTicket.category == category)
    if assigned_to_user_id:
        stmt = stmt.where(FeedbackTicket.assigned_to_user_id == assigned_to_user_id)
    if unassigned:
        stmt = stmt.where(FeedbackTicket.assigned_to_user_id.is_(None))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            (FeedbackTicket.subject.ilike(like))
            | (FeedbackTicket.description.ilike(like))
        )
    if tag:
        clean_tag = tag.strip().lower()
        stmt = stmt.where(
            FeedbackTicket.id.in_(
                select(TicketTag.ticket_id).where(TicketTag.tag == clean_tag)
            )
        )

    if sort == "updated_asc":
        stmt = stmt.order_by(FeedbackTicket.updated_at.asc())
    elif sort == "created_desc":
        stmt = stmt.order_by(FeedbackTicket.created_at.desc())
    elif sort == "created_asc":
        stmt = stmt.order_by(FeedbackTicket.created_at.asc())
    elif sort == "priority_desc":
        from sqlalchemy import case

        rank = case(
            (FeedbackTicket.priority == "urgent", 4),
            (FeedbackTicket.priority == "high", 3),
            (FeedbackTicket.priority == "normal", 2),
            (FeedbackTicket.priority == "low", 1),
            else_=0,
        )
        stmt = stmt.order_by(rank.desc(), FeedbackTicket.updated_at.desc())
    else:
        stmt = stmt.order_by(FeedbackTicket.updated_at.desc())

    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    tickets = list(result.scalars().all())

    if breached:
        now = datetime.now(timezone.utc)
        tickets = [t for t in tickets if sla_service.is_breached(t, now=now)]

    return tickets


async def count_tickets(
    db: AsyncSession,
    *,
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    assigned_to_user_id: str | None = None,
    unassigned: bool = False,
    search: str | None = None,
    tag: str | None = None,
    show_hidden: bool | None = None,
) -> int:
    stmt = select(func.count()).select_from(FeedbackTicket)

    if status and status in VALID_STATUSES:
        stmt = stmt.where(FeedbackTicket.status == status)
    if priority and priority in VALID_PRIORITIES:
        stmt = stmt.where(FeedbackTicket.priority == priority)
    if category and category in VALID_CATEGORIES:
        stmt = stmt.where(FeedbackTicket.category == category)
    if assigned_to_user_id:
        stmt = stmt.where(FeedbackTicket.assigned_to_user_id == assigned_to_user_id)
    if unassigned:
        stmt = stmt.where(FeedbackTicket.assigned_to_user_id.is_(None))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            (FeedbackTicket.subject.ilike(like))
            | (FeedbackTicket.description.ilike(like))
        )
    if tag:
        clean_tag = tag.strip().lower()
        stmt = stmt.where(
            FeedbackTicket.id.in_(
                select(TicketTag.ticket_id).where(TicketTag.tag == clean_tag)
            )
        )

    result = await db.execute(stmt)
    return int(result.scalar_one())


async def get_ticket_any(
    db: AsyncSession,
    ticket_id: str,
) -> FeedbackTicket | None:
    result = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    return result.scalar_one_or_none()


async def get_user_by_id(
    db: AsyncSession,
    user_id: str,
) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def list_all_replies(
    db: AsyncSession,
    ticket_id: str,
) -> list[FeedbackReply]:
    """Admin view — includes internal notes."""
    result = await db.execute(
        select(FeedbackReply)
        .where(FeedbackReply.ticket_id == ticket_id)
        .order_by(FeedbackReply.created_at.asc())
    )
    return list(result.scalars().all())


async def ticket_admin_detail(
    db: AsyncSession,
    ticket: FeedbackTicket,
) -> dict:
    filer = await get_user_by_id(db, ticket.user_id)
    assignee = (
        await get_user_by_id(db, ticket.assigned_to_user_id)
        if ticket.assigned_to_user_id
        else None
    )
    replies = await list_all_replies(db, ticket.id)
    events = await events_service.list_events(db, ticket.id, include_system=True)
    tags = await list_tags(db, ticket.id)
    sla = sla_service.sla_status(ticket)

    ctx = ticket.context or {}
    attached = ctx.get("attached_conversation") or []
    public_context = {
        k: v for k, v in ctx.items() if k != "attached_conversation"
    }

    return {
        "id": str(ticket.id),
        "category": ticket.category,
        "subject": ticket.subject,
        "description": ticket.description,
        "context": public_context,
        "attached_conversation": attached,
        "attachment_url": ticket.attachment_url,
        "status": ticket.status,
        "priority": ticket.priority,
        "last_replied_by": ticket.last_replied_by,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "first_responded_at": (
            ticket.first_responded_at.isoformat()
            if ticket.first_responded_at
            else None
        ),
        "filer": {
            "id": str(filer.id),
            "email": filer.email,
            "name": filer.name,
            "role": filer.role,
        } if filer else None,
        "assignee": {
            "id": str(assignee.id),
            "email": assignee.email,
            "name": assignee.name,
            "role": assignee.role,
        } if assignee else None,
        "tags": tags,
        "sla": sla,
        "replies": [
            {
                "id": str(r.id),
                "author": r.author,
                "content": r.content,
                "created_at": r.created_at.isoformat(),
                "edited_at": (
                    r.edited_at.isoformat() if r.edited_at else None
                ),
            }
            for r in replies
        ],
        "events": [events_service.event_to_dict(e) for e in events],
    }


def ticket_admin_summary(
    t: FeedbackTicket,
    filer: User | None = None,
    assignee: User | None = None,
) -> dict:
    return {
        "hidden_from_admin_at": (
            t.hidden_from_admin_at.isoformat()
            if t.hidden_from_admin_at
            else None
        ),
        "id": str(t.id),
        "category": t.category,
        "subject": t.subject,
        "status": t.status,
        "priority": t.priority,
        "last_replied_by": t.last_replied_by,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "first_response_due_at": (
            t.first_response_due_at.isoformat()
            if t.first_response_due_at
            else None
        ),
        "resolution_due_at": (
            t.resolution_due_at.isoformat() if t.resolution_due_at else None
        ),
        "breached": sla_service.is_breached(t),
        "filer": {
            "id": str(filer.id),
            "email": filer.email,
            "name": filer.name,
        } if filer else None,
        "assignee": {
            "id": str(assignee.id),
            "email": assignee.email,
            "name": assignee.name,
        } if assignee else None,
    }


async def admin_status_change(
    db: AsyncSession,
    *,
    ticket_id: str,
    new_status: str,
    actor_user_id: str,
    expected_updated_at: datetime | None = None,
) -> FeedbackTicket | None:
    if new_status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {new_status}")

    result = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return None

    if expected_updated_at is not None:
        current = ticket.updated_at
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        expected = expected_updated_at
        if expected.tzinfo is None:
            expected = expected.replace(tzinfo=timezone.utc)
        if abs((current - expected).total_seconds()) > 1:
            return ticket

    old_status = ticket.status
    ticket.status = new_status

    if new_status in ("resolved", "closed"):
        if ticket.resolved_at is None:
            ticket.resolved_at = datetime.now(timezone.utc)
    else:
        ticket.resolved_at = None

    await events_service.log_event(
        db,
        ticket_id=ticket.id,
        kind=events_service.KIND_STATUS_CHANGED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"from": old_status, "to": new_status},
        commit=False,
    )
    await db.commit()
    await db.refresh(ticket)

    await webhooks_service.dispatch(
        db,
        event_kind=webhooks_service.EVENT_TICKET_STATUS_CHANGED,
        ticket=ticket,
        extra={"from": old_status, "to": new_status},
    )
    if new_status in ("resolved", "closed"):
        await webhooks_service.dispatch(
            db,
            event_kind=webhooks_service.EVENT_TICKET_RESOLVED,
            ticket=ticket,
        )

    # Notify the filer of the status change
    try:
        await notifications_service.notify_filer_of_status_change(
            db,
            ticket,
            from_status=old_status,
            to_status=new_status,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[feedback] notify_filer_of_status_change failed: {e}")

    # Real-time admin notification (assignee only, when someone else did it)
    if ticket.assigned_to_user_id and str(ticket.assigned_to_user_id) != str(actor_user_id):
        try:
            actor = await get_user_by_id(db, actor_user_id)
            actor_label = (actor.name or actor.email) if actor else "Someone"
            priority = "high" if new_status in ("resolved", "closed") else "normal"
            await pubsub_service.emit_admin_notification(
                kind="ticket.status_changed_by_other",
                title=f"{actor_label} changed status to {new_status.replace('_', ' ')}",
                body=ticket.subject[:140],
                priority=priority,
                recipients=[str(ticket.assigned_to_user_id)],
                recipients_mode="assignee",
                ticket_id=str(ticket.id),
                ticket_subject=ticket.subject,
                click_url=f"/admin/tickets/{ticket.id}",
                extra={"from": old_status, "to": new_status},
            )
        except Exception as e:  # noqa: BLE001
            print(f"[feedback] emit status_changed_by_other failed: {e}")

    return ticket


async def set_priority(
    db: AsyncSession,
    *,
    ticket_id: str,
    new_priority: str,
    actor_user_id: str,
) -> FeedbackTicket | None:
    if new_priority not in VALID_PRIORITIES:
        raise ValueError(f"Invalid priority: {new_priority}")

    result = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return None

    old_priority = ticket.priority
    ticket.priority = new_priority

    await sla_service.apply_sla_to_ticket(db, ticket, commit=False)

    await events_service.log_event(
        db,
        ticket_id=ticket.id,
        kind=events_service.KIND_PRIORITY_CHANGED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"from": old_priority, "to": new_priority},
        commit=False,
    )
    await db.commit()
    await db.refresh(ticket)

    await webhooks_service.dispatch(
        db,
        event_kind=webhooks_service.EVENT_TICKET_PRIORITY_CHANGED,
        ticket=ticket,
        extra={"from": old_priority, "to": new_priority},
    )
    return ticket


async def assign_ticket(
    db: AsyncSession,
    *,
    ticket_id: str,
    assignee_user_id: str | None,
    actor_user_id: str,
) -> FeedbackTicket | None:
    result = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return None

    if assignee_user_id:
        assignee = await get_user_by_id(db, assignee_user_id)
        if assignee is None:
            raise ValueError("Assignee not found")

    old_assignee = ticket.assigned_to_user_id
    ticket.assigned_to_user_id = assignee_user_id

    await events_service.log_event(
        db,
        ticket_id=ticket.id,
        kind=events_service.KIND_ASSIGNED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"from": old_assignee, "to": assignee_user_id},
        commit=False,
    )
    await db.commit()
    await db.refresh(ticket)

    await webhooks_service.dispatch(
        db,
        event_kind=webhooks_service.EVENT_TICKET_ASSIGNED,
        ticket=ticket,
        extra={"from": old_assignee, "to": assignee_user_id},
    )

    # Notify the new assignee (skip if unassigned or self-assigned)
    if assignee_user_id:
        try:
            await notifications_service.notify_assignment(
                db,
                ticket,
                assignee_user_id=assignee_user_id,
                assigned_by_user_id=actor_user_id,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[feedback] notify_assignment failed: {e}")

        # Real-time toast for the new assignee
        if str(assignee_user_id) != str(actor_user_id):
            try:
                actor = await get_user_by_id(db, actor_user_id)
                actor_label = (actor.name or actor.email) if actor else "Someone"
                await pubsub_service.emit_admin_notification(
                    kind="ticket.assigned_to_me",
                    title=f"Assigned to you: {ticket.subject[:80]}",
                    body=f"Assigned by {actor_label}",
                    priority="high",
                    recipients=[str(assignee_user_id)],
                    recipients_mode="assignee",
                    ticket_id=str(ticket.id),
                    ticket_subject=ticket.subject,
                    click_url=f"/admin/tickets/{ticket.id}",
                )
            except Exception as e:  # noqa: BLE001
                print(f"[feedback] emit ticket.assigned_to_me failed: {e}")

    return ticket


async def add_team_reply_with_event(
    db: AsyncSession,
    *,
    ticket_id: str,
    content: str,
    actor_user_id: str,
) -> FeedbackReply | None:
    result = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return None

    reply = FeedbackReply(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author="team",
        content=content.strip(),
    )
    db.add(reply)

    sla_service.mark_first_response(ticket)
    ticket.last_replied_by = "team"

    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_REPLIED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"reply_id": reply.id},
        commit=False,
    )
    await db.commit()
    await db.refresh(reply)
    await db.refresh(ticket)

    await webhooks_service.dispatch(
        db,
        event_kind=webhooks_service.EVENT_TICKET_REPLIED,
        ticket=ticket,
        extra={"reply_id": reply.id, "author": "team"},
    )

    # Notify the filer that a team member replied
    try:
        await notifications_service.notify_filer_of_reply(
            db,
            ticket,
            reply_content=reply.content,
        )
    except Exception as e:  # noqa: BLE001
        print(f"[feedback] notify_filer_of_reply failed: {e}")

    # Real-time admin notification (assignee only)
    try:
        if ticket.assigned_to_user_id and str(ticket.assigned_to_user_id) != str(actor_user_id):
            actor = await get_user_by_id(db, actor_user_id)
            actor_label = (actor.name or actor.email) if actor else "A teammate"
            await pubsub_service.emit_admin_notification(
                kind="ticket.team_replied",
                title=f"Reply on your ticket from {actor_label}",
                body=reply.content[:140] + ("..." if len(reply.content) > 140 else ""),
                priority="normal",
                recipients=[str(ticket.assigned_to_user_id)],
                recipients_mode="assignee",
                ticket_id=str(ticket.id),
                ticket_subject=ticket.subject,
                click_url=f"/admin/tickets/{ticket.id}",
            )
    except Exception as e:  # noqa: BLE001
        print(f"[feedback] emit ticket.team_replied failed: {e}")

    return reply


async def add_note(
    db: AsyncSession,
    *,
    ticket_id: str,
    content: str,
    actor_user_id: str,
) -> FeedbackReply | None:
    result = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        return None

    note = FeedbackReply(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author="note",
        content=content.strip(),
    )
    db.add(note)

    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_NOTE_ADDED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"note_id": note.id},
        commit=False,
    )
    await db.commit()
    await db.refresh(note)
    return note


# ---------------------------------------------------------------------
# tags
# ---------------------------------------------------------------------


async def list_tags(db: AsyncSession, ticket_id: str) -> list[str]:
    result = await db.execute(
        select(TicketTag.tag)
        .where(TicketTag.ticket_id == ticket_id)
        .order_by(TicketTag.tag.asc())
    )
    return [row[0] for row in result.all()]


async def add_tag(
    db: AsyncSession,
    *,
    ticket_id: str,
    tag: str,
    actor_user_id: str,
) -> list[str]:
    clean = tag.strip().lower()[:64]
    if not clean:
        return await list_tags(db, ticket_id)

    existing = await db.execute(
        select(TicketTag).where(
            TicketTag.ticket_id == ticket_id,
            TicketTag.tag == clean,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return await list_tags(db, ticket_id)

    row = TicketTag(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        tag=clean,
        created_by=actor_user_id,
    )
    db.add(row)

    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_TAG_ADDED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"tag": clean},
        commit=False,
    )
    await db.commit()
    return await list_tags(db, ticket_id)


async def remove_tag(
    db: AsyncSession,
    *,
    ticket_id: str,
    tag: str,
    actor_user_id: str,
) -> list[str]:
    clean = tag.strip().lower()
    result = await db.execute(
        select(TicketTag).where(
            TicketTag.ticket_id == ticket_id,
            TicketTag.tag == clean,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return await list_tags(db, ticket_id)

    await db.delete(row)
    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_TAG_REMOVED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"tag": clean},
        commit=False,
    )
    await db.commit()
    return await list_tags(db, ticket_id)


async def list_all_tags(db: AsyncSession) -> list[tuple[str, int]]:
    result = await db.execute(
        select(TicketTag.tag, func.count())
        .group_by(TicketTag.tag)
        .order_by(func.count().desc(), TicketTag.tag.asc())
    )
    return [(row[0], int(row[1])) for row in result.all()]


# ---------------------------------------------------------------------
# stats
# ---------------------------------------------------------------------


async def admin_stats(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)

    async def _count(*where) -> int:
        stmt = select(func.count()).select_from(FeedbackTicket)
        for w in where:
            stmt = stmt.where(w)
        res = await db.execute(stmt)
        return int(res.scalar_one())

    total = await _count()
    open_ = await _count(FeedbackTicket.status == "open")
    in_progress = await _count(FeedbackTicket.status == "in_progress")
    resolved = await _count(FeedbackTicket.status == "resolved")
    closed = await _count(FeedbackTicket.status == "closed")

    unassigned = await _count(
        FeedbackTicket.assigned_to_user_id.is_(None),
        FeedbackTicket.status.in_(["open", "in_progress"]),
    )

    open_tickets_res = await db.execute(
        select(FeedbackTicket).where(
            FeedbackTicket.status.in_(["open", "in_progress"])
        )
    )
    open_tickets = list(open_tickets_res.scalars().all())
    breached = sum(1 for t in open_tickets if sla_service.is_breached(t, now=now))

    return {
        "total": total,
        "by_status": {
            "open": open_,
            "in_progress": in_progress,
            "resolved": resolved,
            "closed": closed,
        },
        "unassigned_open": unassigned,
        "sla_breached_open": breached,
        "generated_at": now.isoformat(),
    }


# ---------------------------------------------------------------------
# macros (canned responses)
# ---------------------------------------------------------------------


async def list_all_macros(db: AsyncSession) -> list[CannedResponse]:
    result = await db.execute(
        select(CannedResponse).order_by(CannedResponse.title.asc())
    )
    return list(result.scalars().all())


async def get_macro(db: AsyncSession, macro_id: str) -> CannedResponse | None:
    result = await db.execute(
        select(CannedResponse).where(CannedResponse.id == macro_id)
    )
    return result.scalar_one_or_none()


async def create_macro(
    db: AsyncSession,
    *,
    title: str,
    body: str,
    tags: list[str] | None = None,
    actor_user_id: str | None = None,
) -> CannedResponse:
    macro = CannedResponse(
        id=str(uuid.uuid4()),
        title=title.strip()[:120],
        body=body,
        tags=tags or [],
        created_by=actor_user_id,
    )
    db.add(macro)
    await db.commit()
    await db.refresh(macro)
    return macro


async def update_macro(
    db: AsyncSession,
    macro_id: str,
    *,
    title: str | None = None,
    body: str | None = None,
    tags: list[str] | None = None,
) -> CannedResponse | None:
    macro = await get_macro(db, macro_id)
    if macro is None:
        return None

    if title is not None:
        macro.title = title.strip()[:120]
    if body is not None:
        macro.body = body
    if tags is not None:
        macro.tags = tags

    await db.commit()
    await db.refresh(macro)
    return macro


async def delete_macro(db: AsyncSession, macro_id: str) -> bool:
    macro = await get_macro(db, macro_id)
    if macro is None:
        return False
    await db.delete(macro)
    await db.commit()
    return True


def macro_to_dict(m: CannedResponse) -> dict:
    return {
        "id": str(m.id),
        "title": m.title,
        "body": m.body,
        "tags": m.tags or [],
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


# =====================================================================
# WAVE B — FULL-TEXT SEARCH, BULK, MACRO RENDERING
# =====================================================================


# ---------------------------------------------------------------------
# full-text search
# ---------------------------------------------------------------------


async def search_tickets(
    db: AsyncSession,
    *,
    query: str,
    status: str | None = None,
    priority: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[tuple[FeedbackTicket, float]], int]:
    """
    Full-text search across subject + description (weighted tsvector) AND
    the reply bodies. Uses websearch_to_tsquery for natural syntax:
    quotes, OR, -exclude all work.

    Returns ([(ticket, rank), ...], total_count). Ranking is the sum of
    subject/description rank + a smaller bonus for reply matches.
    """
    q = (query or "").strip()
    if not q:
        return [], 0

    # Base filters shared by search + count
    filters = []
    params: dict = {"q": q}

    if status and status in VALID_STATUSES:
        filters.append("t.status = :status")
        params["status"] = status
    if priority and priority in VALID_PRIORITIES:
        filters.append("t.priority = :priority")
        params["priority"] = priority

    where_sql = (" AND " + " AND ".join(filters)) if filters else ""

    # Match either the ticket's search_vector or any of its replies
    match_sql = """
        (
            t.search_vector @@ websearch_to_tsquery('english', :q)
            OR EXISTS (
                SELECT 1 FROM feedback_replies r
                WHERE r.ticket_id = t.id
                  AND to_tsvector('english', COALESCE(r.content, ''))
                      @@ websearch_to_tsquery('english', :q)
            )
        )
    """

    # Rank: subject/description matches weighted higher, reply matches lower
    rank_sql = """
        COALESCE(ts_rank(t.search_vector, websearch_to_tsquery('english', :q)), 0)
        + 0.25 * COALESCE((
            SELECT MAX(
                ts_rank(
                    to_tsvector('english', COALESCE(r2.content, '')),
                    websearch_to_tsquery('english', :q)
                )
            )
            FROM feedback_replies r2
            WHERE r2.ticket_id = t.id
        ), 0)
    """

    sql = text(
        f"""
        SELECT t.id, ({rank_sql}) AS rank
        FROM feedback_tickets t
        WHERE {match_sql}
        {where_sql}
        ORDER BY rank DESC, t.updated_at DESC
        LIMIT :limit OFFSET :offset
        """
    )

    count_sql = text(
        f"""
        SELECT COUNT(*) FROM feedback_tickets t
        WHERE {match_sql}
        {where_sql}
        """
    )

    params_with_page = {**params, "limit": limit, "offset": offset}

    rows = (await db.execute(sql, params_with_page)).all()
    total = int((await db.execute(count_sql, params)).scalar_one())

    if not rows:
        return [], total

    # Normalize UUIDs → strings once, on both sides
    ids: list[str] = [str(row[0]) for row in rows]
    rank_map: dict[str, float] = {str(row[0]): float(row[1]) for row in rows}

    # Fetch tickets, preserving rank order
    tickets_res = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id.in_(ids))
    )
    tickets_by_id = {str(t.id): t for t in tickets_res.scalars().all()}

    ordered = [
        (tickets_by_id[tid], rank_map[tid])
        for tid in ids
        if tid in tickets_by_id
    ]

    return ordered, total


# ---------------------------------------------------------------------
# bulk actions
# ---------------------------------------------------------------------


async def bulk_update(
    db: AsyncSession,
    *,
    ticket_ids: list[str],
    actor_user_id: str,
    status: str | None = None,
    priority: str | None = None,
    assign_to_user_id: str | None = None,
    assign_to_me_user_id: str | None = None,
    add_tag_value: str | None = None,
) -> dict:
    """
    Apply one or more updates to many tickets at once. Returns a summary:
      {"updated": N, "skipped": N, "errors": [{id, reason}, ...]}

    At least one of status/priority/assign/tag must be provided. Tag
    additions go through add_tag (idempotent per ticket).
    """
    if not ticket_ids:
        return {"updated": 0, "skipped": 0, "errors": []}

    if not any([status, priority, assign_to_user_id, assign_to_me_user_id, add_tag_value]):
        raise ValueError("No bulk action specified")

    if status is not None and status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {status}")
    if priority is not None and priority not in VALID_PRIORITIES:
        raise ValueError(f"Invalid priority: {priority}")

    target_assignee = assign_to_me_user_id or assign_to_user_id

    updated = 0
    skipped = 0
    errors: list[dict] = []

    for tid in ticket_ids:
        try:
            ticket = await get_ticket_any(db, tid)
            if ticket is None:
                skipped += 1
                errors.append({"id": tid, "reason": "not found"})
                continue

            # Status — use the single-ticket helper for event + webhook
            if status is not None and ticket.status != status:
                await admin_status_change(
                    db,
                    ticket_id=tid,
                    new_status=status,
                    actor_user_id=actor_user_id,
                )

            # Priority
            if priority is not None and ticket.priority != priority:
                await set_priority(
                    db,
                    ticket_id=tid,
                    new_priority=priority,
                    actor_user_id=actor_user_id,
                )

            # Assign
            if target_assignee is not None or assign_to_user_id == "":
                await assign_ticket(
                    db,
                    ticket_id=tid,
                    assignee_user_id=target_assignee or None,
                    actor_user_id=actor_user_id,
                )

            # Tag
            if add_tag_value:
                await add_tag(
                    db,
                    ticket_id=tid,
                    tag=add_tag_value,
                    actor_user_id=actor_user_id,
                )

            updated += 1
        except Exception as e:  # noqa: BLE001
            skipped += 1
            errors.append({"id": tid, "reason": str(e)})

    return {"updated": updated, "skipped": skipped, "errors": errors}


# ---------------------------------------------------------------------
# macro rendering + reply-with-macro
# ---------------------------------------------------------------------


def render_macro(
    body: str,
    *,
    filer_name: str | None = None,
    filer_email: str | None = None,
    ticket_id: str | None = None,
    ticket_subject: str | None = None,
    admin_name: str | None = None,
) -> str:
    """
    Substitute {{var}} placeholders in a macro body.

    Supported variables:
      {{filer_name}}      → filer's display name (or "there" if missing)
      {{filer_email}}     → filer's email
      {{ticket_id}}       → ticket UUID
      {{ticket_subject}}  → ticket subject
      {{admin_name}}      → the replying admin's name (or "The Cortex team")
      {{date}}            → today's date, ISO

    Unknown {{vars}} are left intact so authors can see typos.
    """
    replacements = {
        "filer_name": (filer_name or "").strip() or "there",
        "filer_email": (filer_email or "").strip(),
        "ticket_id": (ticket_id or "").strip(),
        "ticket_subject": (ticket_subject or "").strip(),
        "admin_name": (admin_name or "").strip() or "The Cortex team",
        "date": datetime.now(timezone.utc).date().isoformat(),
    }

    out = body
    for key, value in replacements.items():
        out = out.replace("{{" + key + "}}", value)
    return out


async def reply_with_macro(
    db: AsyncSession,
    *,
    ticket_id: str,
    macro_id: str,
    actor_user_id: str,
    extra_note: str | None = None,
    override_body: str | None = None,
) -> FeedbackReply | None:
    """
    Post a team reply rendered from a macro. Filer context is pulled
    automatically. `override_body` (if provided) replaces the macro body
    before rendering — useful when an admin tweaks the draft in the UI.
    """
    ticket = await get_ticket_any(db, ticket_id)
    if ticket is None:
        return None

    macro = await get_macro(db, macro_id)
    if macro is None:
        raise ValueError("Macro not found")

    filer = await get_user_by_id(db, ticket.user_id)
    actor = await get_user_by_id(db, actor_user_id)

    body_template = override_body if override_body is not None else macro.body
    rendered = render_macro(
        body_template,
        filer_name=filer.name if filer else None,
        filer_email=filer.email if filer else None,
        ticket_id=str(ticket.id),
        ticket_subject=ticket.subject,
        admin_name=actor.name if actor else None,
    )

    if extra_note:
        rendered = rendered.rstrip() + "\n\n" + extra_note.strip()

    return await add_team_reply_with_event(
        db,
        ticket_id=ticket_id,
        content=rendered,
        actor_user_id=actor_user_id,
    )


# =====================================================================
# SOFT DELETE — admin-only hide / restore
# =====================================================================


HIDEABLE_STATUSES = {"resolved", "closed"}


async def hide_ticket(
    db: AsyncSession,
    ticket_id: str,
    *,
    actor_user_id: str | None = None,
) -> dict:
    """
    Hide a resolved/closed ticket from the admin list.
    The filer still sees it. Returns {"ok": bool, "reason": str}.
    """
    ticket = await get_ticket_any(db, ticket_id)
    if ticket is None:
        return {"ok": False, "reason": "not_found"}

    if ticket.status not in HIDEABLE_STATUSES:
        return {
            "ok": False,
            "reason": f"only_{'_or_'.join(sorted(HIDEABLE_STATUSES))}_tickets_can_be_cleared",
        }

    if ticket.hidden_from_admin_at is not None:
        return {"ok": True, "already_hidden": True}

    ticket.hidden_from_admin_at = datetime.now(timezone.utc)
    await db.commit()

    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_STATUS_CHANGED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"action": "hidden_from_admin"},
    )
    return {"ok": True}


async def restore_ticket(
    db: AsyncSession,
    ticket_id: str,
    *,
    actor_user_id: str | None = None,
) -> dict:
    """Unhide a previously cleared ticket."""
    ticket = await get_ticket_any(db, ticket_id)
    if ticket is None:
        return {"ok": False, "reason": "not_found"}

    if ticket.hidden_from_admin_at is None:
        return {"ok": True, "already_visible": True}

    ticket.hidden_from_admin_at = None
    await db.commit()

    await events_service.log_event(
        db,
        ticket_id=ticket_id,
        kind=events_service.KIND_STATUS_CHANGED,
        actor_kind=events_service.ACTOR_TEAM,
        actor_user_id=actor_user_id,
        data={"action": "restored_to_admin"},
    )
    return {"ok": True}


async def unhide_on_user_reply(
    db: AsyncSession,
    ticket: FeedbackTicket,
) -> None:
    """
    If a hidden ticket gets a new user reply, un-hide it so admins
    see the fresh activity. Call from add_user_reply.
    """
    if ticket.hidden_from_admin_at is None:
        return
    ticket.hidden_from_admin_at = None
    await db.commit()
