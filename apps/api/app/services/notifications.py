"""
High-level notification helpers.

These functions sit between "something happened on a ticket" and the
low-level email sender. They:

  1. Read `admin_notification_prefs` to find out who opted in
  2. Skip the current user (don't email the person who just acted)
  3. Dedupe (no double-sending to the same address)
  4. Fire-and-forget via `email.queue_email()` — never block the caller
  5. Log a tiny audit line

Callers (feedback.py, sla_jobs.py, admin.py) only know about the event,
not about recipients, prefs, or templates.

Templates used:
    new_ticket   → when a user files a ticket
    assignment   → when a ticket is assigned
    user_reply   → when a user replies on a ticket
    sla_breach   → when a ticket breaches its SLA window
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AdminNotificationPrefs,
    FeedbackTicket,
    User,
    UserNotificationPrefs,
)
from app.services import email as email_service
from app.services import pubsub as pubsub_service


# =====================================================================
# shared context builder
# =====================================================================


def _ticket_ctx(ticket: FeedbackTicket) -> dict:
    """Serialize the ticket fields templates need."""
    return {
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


async def _user_ctx(db: AsyncSession, user_id: str | None) -> dict | None:
    if not user_id:
        return None
    res = await db.execute(select(User).where(User.id == user_id))
    u = res.scalar_one_or_none()
    if u is None:
        return None
    return {
        "id": str(u.id),
        "name": u.name,
        "email": u.email,
    }


# =====================================================================
# end-user (filer) preferences
# =====================================================================


def _new_unsubscribe_token() -> str:
    return secrets.token_urlsafe(24)[:32]


def _is_deliverable(email: str | None) -> bool:
    """
    Return False for placeholder / obviously-undeliverable addresses.

    Clerk sessions without a real email claim get a `@clerk.local`
    placeholder. `.local` and `.invalid` are reserved TLDs that will
    always bounce. Filtering them here prevents wasted SMTP quota and
    protects our sender reputation.
    """
    if not email:
        return False
    e = email.strip().lower()
    if not e or "@" not in e:
        return False
    domain = e.rsplit("@", 1)[1]
    if domain.endswith(".local") or domain.endswith(".invalid"):
        return False
    if domain == "clerk.local" or domain.endswith(".clerk.local"):
        return False
    return True


async def get_user_prefs(
    db: AsyncSession,
    user_id: str,
) -> UserNotificationPrefs:
    """
    Return (or create) the notification prefs for an end-user.

    Created lazily on first access — mirrors how AdminNotificationPrefs
    works. All toggles default ON, and the row always has a fresh
    unsubscribe token.
    """
    res = await db.execute(
        select(UserNotificationPrefs).where(
            UserNotificationPrefs.user_id == user_id
        )
    )
    row = res.scalar_one_or_none()
    if row is not None:
        return row

    row = UserNotificationPrefs(
        user_id=user_id,
        unsubscribe_token=_new_unsubscribe_token(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_user_prefs(
    db: AsyncSession,
    user_id: str,
    *,
    email_on_ticket_reply: bool | None = None,
    email_on_status_change: bool | None = None,
    email_on_resolved: bool | None = None,
    insights_enabled: bool | None = None,
    insights_dormant_revival: bool | None = None,
    insights_contradiction: bool | None = None,
    insights_decision_drift: bool | None = None,
    insights_rhythm: bool | None = None,
) -> UserNotificationPrefs:
    """Patch any subset of the filer's notification toggles."""
    row = await get_user_prefs(db, user_id)
    if email_on_ticket_reply is not None:
        row.email_on_ticket_reply = email_on_ticket_reply
    if email_on_status_change is not None:
        row.email_on_status_change = email_on_status_change
    if email_on_resolved is not None:
        row.email_on_resolved = email_on_resolved
    if insights_enabled is not None:
        row.insights_enabled = insights_enabled
    if insights_dormant_revival is not None:
        row.insights_dormant_revival = insights_dormant_revival
    if insights_contradiction is not None:
        row.insights_contradiction = insights_contradiction
    if insights_decision_drift is not None:
        row.insights_decision_drift = insights_decision_drift
    if insights_rhythm is not None:
        row.insights_rhythm = insights_rhythm
    await db.commit()
    await db.refresh(row)
    return row


async def find_user_by_unsubscribe_token(
    db: AsyncSession,
    token: str,
) -> User | None:
    """Look up the user whose prefs row has this unsubscribe token."""
    res = await db.execute(
        select(UserNotificationPrefs).where(
            UserNotificationPrefs.unsubscribe_token == token
        )
    )
    prefs = res.scalar_one_or_none()
    if prefs is None:
        return None
    user_res = await db.execute(
        select(User).where(User.id == prefs.user_id)
    )
    return user_res.scalar_one_or_none()


async def unsubscribe_all(db: AsyncSession, token: str) -> User | None:
    """
    Opt a user out of every end-user notification. Returns the user, or
    None if the token is invalid.
    """
    res = await db.execute(
        select(UserNotificationPrefs).where(
            UserNotificationPrefs.unsubscribe_token == token
        )
    )
    prefs = res.scalar_one_or_none()
    if prefs is None:
        return None

    prefs.email_on_ticket_reply = False
    prefs.email_on_status_change = False
    prefs.email_on_resolved = False
    await db.commit()

    user_res = await db.execute(
        select(User).where(User.id == prefs.user_id)
    )
    return user_res.scalar_one_or_none()


def user_prefs_to_dict(p: UserNotificationPrefs) -> dict:
    return {
        "user_id": str(p.user_id),
        "email_on_ticket_reply": p.email_on_ticket_reply,
        "email_on_status_change": p.email_on_status_change,
        "email_on_resolved": p.email_on_resolved,
        "insights_enabled": bool(getattr(p, "insights_enabled", False)),
        "insights_dormant_revival": bool(
            getattr(p, "insights_dormant_revival", True)
        ),
        "insights_contradiction": bool(
            getattr(p, "insights_contradiction", True)
        ),
        "insights_decision_drift": bool(
            getattr(p, "insights_decision_drift", True)
        ),
        "insights_rhythm": bool(getattr(p, "insights_rhythm", True)),
        "unsubscribe_token": p.unsubscribe_token,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# =====================================================================
# recipient resolution
# =====================================================================


async def _opted_in_admins(
    db: AsyncSession,
    flag: str,
) -> list[User]:
    """
    Return every admin/agent whose prefs have `flag` enabled.

    Missing prefs row → treated as opted-in with defaults
    (matching `prefs.get_prefs` behavior).
    """
    users_res = await db.execute(
        select(User).where(User.role.in_(["admin", "agent"]))
    )
    users = list(users_res.scalars().all())
    if not users:
        return []

    user_ids = [str(u.id) for u in users]
    prefs_res = await db.execute(
        select(AdminNotificationPrefs).where(
            AdminNotificationPrefs.user_id.in_(user_ids)
        )
    )
    prefs_by_user = {str(p.user_id): p for p in prefs_res.scalars().all()}

    out: list[User] = []
    for u in users:
        p = prefs_by_user.get(str(u.id))
        if p is None:
            # No prefs yet — treat as default-on for event flags
            out.append(u)
            continue
        if getattr(p, flag, True):
            out.append(u)
    return out


async def _one_user_if_opted_in(
    db: AsyncSession,
    user_id: str | None,
    flag: str,
) -> list[User]:
    """Return [user] if that user has the flag on, else []."""
    if not user_id:
        return []

    res = await db.execute(select(User).where(User.id == user_id))
    u = res.scalar_one_or_none()
    if u is None:
        return []

    prefs = (
        await db.execute(
            select(AdminNotificationPrefs).where(
                AdminNotificationPrefs.user_id == user_id
            )
        )
    ).scalar_one_or_none()

    if prefs is None:
        return [u]  # default opt-in
    if getattr(prefs, flag, True):
        return [u]
    return []


def _dedupe(users: list[User], skip_user_id: str | None = None) -> list[User]:
    seen: set[str] = set()
    out: list[User] = []
    for u in users:
        if skip_user_id and str(u.id) == str(skip_user_id):
            continue
        e = (u.email or "").strip().lower()
        if not e or e in seen:
            continue
        seen.add(e)
        out.append(u)
    return out


# =====================================================================
# notify: new ticket
# =====================================================================


async def notify_new_ticket(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    skip_user_id: str | None = None,
) -> int:
    """
    Notify all opted-in admins/agents about a new ticket.

    `skip_user_id` — usually the filer, so if an admin files their own
    ticket they don't get an email about it.

    Returns the number of emails queued.
    """
    recipients = await _opted_in_admins(db, "email_on_new_ticket")
    recipients = _dedupe(recipients, skip_user_id)
    if not recipients:
        return 0

    filer = await _user_ctx(db, str(ticket.user_id))
    ctx = {
        "ticket": _ticket_ctx(ticket),
        "filer": filer,
        "web_url": None,  # templates fall back to settings.web_url
    }

    subject = f"[Cortex] New ticket: {ticket.subject[:120]}"

    for u in recipients:
        ctx_with_user = {**ctx, "recipient": {"name": u.name, "email": u.email}}
        await email_service.queue_email(
            to=u.email,
            template="new_ticket",
            subject=subject,
            context=ctx_with_user,
            ticket_id=str(ticket.id),
        )

    print(f"[notify] new_ticket → {len(recipients)} recipient(s)")
    return len(recipients)


# =====================================================================
# notify: assignment
# =====================================================================


async def notify_assignment(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    assignee_user_id: str,
    assigned_by_user_id: str | None = None,
) -> int:
    """
    Notify the assignee. Skips if the assigner is assigning themselves.
    """
    recipients = await _one_user_if_opted_in(
        db, assignee_user_id, "email_on_assignment"
    )
    # Don't email someone who just assigned the ticket to themselves
    recipients = _dedupe(recipients, assigned_by_user_id)
    if not recipients:
        return 0

    assigner = await _user_ctx(db, assigned_by_user_id)
    ctx = {
        "ticket": _ticket_ctx(ticket),
        "assigner": assigner,
    }
    subject = f"[Cortex] Assigned to you: {ticket.subject[:120]}"

    for u in recipients:
        if not _is_deliverable(u.email):
            continue
        await email_service.queue_email(
            to=u.email,
            template="assignment",
            subject=subject,
            context={**ctx, "recipient": {"name": u.name, "email": u.email}},
            ticket_id=str(ticket.id),
        )

    print(f"[notify] assignment → {len(recipients)} recipient(s)")
    return len(recipients)


# =====================================================================
# notify: user reply
# =====================================================================


async def notify_user_reply(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    reply_content: str,
    reply_author_user_id: str | None = None,
) -> int:
    """
    Notify the ticket's assignee when the filer replies.

    If there's no assignee, notify all opted-in admins/agents so nobody
    misses the reply.
    """
    if ticket.assigned_to_user_id:
        recipients = await _one_user_if_opted_in(
            db, str(ticket.assigned_to_user_id), "email_on_user_reply"
        )
    else:
        recipients = await _opted_in_admins(db, "email_on_user_reply")

    # Never email the person who wrote the reply
    recipients = _dedupe(recipients, reply_author_user_id)
    if not recipients:
        return 0

    filer = await _user_ctx(db, str(ticket.user_id))
    ctx = {
        "ticket": _ticket_ctx(ticket),
        "filer": filer,
        "reply": {
            "content": reply_content[:2000],
        },
    }
    subject = f"[Cortex] User replied: {ticket.subject[:120]}"

    for u in recipients:
        if not _is_deliverable(u.email):
            continue
        await email_service.queue_email(
            to=u.email,
            template="user_reply",
            subject=subject,
            context={**ctx, "recipient": {"name": u.name, "email": u.email}},
            ticket_id=str(ticket.id),
        )

    print(f"[notify] user_reply → {len(recipients)} recipient(s)")
    return len(recipients)


# =====================================================================
# notify: SLA breach
# =====================================================================


async def notify_sla_breach(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    category: str,  # "first_response" | "resolution"
    priority: str | None = None,
) -> int:
    """
    Notify the assignee (or, if unassigned, everyone opted in) that a
    ticket just breached its SLA.
    """
    if ticket.assigned_to_user_id:
        recipients = await _one_user_if_opted_in(
            db, str(ticket.assigned_to_user_id), "email_on_sla_breach"
        )
    else:
        recipients = await _opted_in_admins(db, "email_on_sla_breach")

    recipients = _dedupe(recipients)
    if not recipients:
        return 0

    filer = await _user_ctx(db, str(ticket.user_id))
    ctx = {
        "ticket": _ticket_ctx(ticket),
        "filer": filer,
        "category": category,
        "priority": priority or ticket.priority,
    }
    subject = f"[Cortex] SLA breached ({category}): {ticket.subject[:110]}"

    for u in recipients:
        if not _is_deliverable(u.email):
            continue
        await email_service.queue_email(
            to=u.email,
            template="sla_breach",
            subject=subject,
            context={**ctx, "recipient": {"name": u.name, "email": u.email}},
            ticket_id=str(ticket.id),
        )

    print(f"[notify] sla_breach → {len(recipients)} recipient(s)")
    return len(recipients)



# =====================================================================
# notify filer: team reply
# =====================================================================


async def notify_filer_of_reply(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    reply_content: str,
) -> int:
    """
    Email the filer when a team member posts a reply on their ticket.

    Respects the filer's `email_on_ticket_reply` toggle. Uses a
    per-user unsubscribe token in the footer.
    """
    filer_id = str(ticket.user_id)
    prefs = await get_user_prefs(db, filer_id)
    if not prefs.email_on_ticket_reply:
        return 0

    filer = await _user_ctx(db, filer_id)
    if not filer or not _is_deliverable(filer.get("email")):
        print(
            f"[notify] reply_to_filer skipped "
            f"(undeliverable address: {filer.get('email') if filer else 'no filer'})"
        )
        return 0

    ctx = {
        "ticket": _ticket_ctx(ticket),
        "filer": filer,
        "reply": {"content": reply_content[:3000]},
        "unsubscribe_token": prefs.unsubscribe_token,
        "unsubscribe_url": (
            f"{_web_url()}/help/unsubscribe?token={prefs.unsubscribe_token}"
        ),
    }
    subject = f"New reply on your ticket \u2014 {ticket.subject[:110]}"

    from app.config.settings import settings as _s

    reply_to_addr = (
        f"reply+{ticket.id}@{_s.inbound_email_domain}"
        if getattr(_s, "inbound_email_domain", None)
        else None
    )

    await email_service.queue_email(
        to=filer["email"],
        template="ticket_reply_to_user",
        subject=subject,
        context=ctx,
        ticket_id=str(ticket.id),
        reply_to=reply_to_addr,
    )

    await push_user_notification(
        filer_id,
        event_kind="ticket_reply",
        title="New reply on your ticket",
        body=(reply_content[:180] + ("\u2026" if len(reply_content) > 180 else "")),
        ticket_id=str(ticket.id),
        ticket_subject=ticket.subject,
        click_url=f"/help?ticket={ticket.id}",
    )

    print(f"[notify] reply_to_filer \u2192 {filer['email']}")
    return 1


# =====================================================================
# notify filer: status change
# =====================================================================


async def notify_filer_of_status_change(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    from_status: str,
    to_status: str,
) -> int:
    """
    Email the filer when an admin changes the ticket status.

    Two toggles are consulted:
      - email_on_resolved    (for transitions INTO resolved/closed)
      - email_on_status_change (for all other transitions)

    This lets users mute progress noise while still getting the
    "it's fixed" email.
    """
    filer_id = str(ticket.user_id)
    prefs = await get_user_prefs(db, filer_id)

    is_resolution = to_status in ("resolved", "closed")
    if is_resolution:
        if not prefs.email_on_resolved:
            return 0
    else:
        if not prefs.email_on_status_change:
            return 0

    filer = await _user_ctx(db, filer_id)
    if not filer or not _is_deliverable(filer.get("email")):
        print(
            f"[notify] status_to_filer skipped "
            f"(undeliverable address: {filer.get('email') if filer else 'no filer'})"
        )
        return 0

    ctx = {
        "ticket": _ticket_ctx(ticket),
        "filer": filer,
        "from_status": from_status,
        "to_status": to_status,
        "is_resolution": is_resolution,
        "unsubscribe_token": prefs.unsubscribe_token,
        "unsubscribe_url": (
            f"{_web_url()}/help/unsubscribe?token={prefs.unsubscribe_token}"
        ),
    }

    # Subject line adapts to the transition
    if to_status == "in_progress":
        subject = f"We're on it \u2014 {ticket.subject[:110]}"
    elif to_status == "resolved":
        subject = f"Your ticket was resolved \u2014 {ticket.subject[:110]}"
    elif to_status == "closed":
        subject = f"Your ticket was closed \u2014 {ticket.subject[:110]}"
    elif to_status == "open":
        subject = f"Your ticket was reopened \u2014 {ticket.subject[:110]}"
    else:
        subject = f"Status update on your ticket \u2014 {ticket.subject[:110]}"

    await email_service.queue_email(
        to=filer["email"],
        template="ticket_status_changed",
        subject=subject,
        context=ctx,
        ticket_id=str(ticket.id),
    )

    await push_user_notification(
        filer_id,
        event_kind="ticket_status_changed",
        title=subject,
        body=f"Status changed from {from_status} to {to_status}.",
        ticket_id=str(ticket.id),
        ticket_subject=ticket.subject,
        click_url=f"/help?ticket={ticket.id}",
        extra={"from_status": from_status, "to_status": to_status},
    )

    print(
        f"[notify] status_to_filer \u2192 {filer['email']} "
        f"({from_status} \u2192 {to_status})"
    )
    return 1


# =====================================================================
# in-app notifications (bell)
# =====================================================================


async def push_user_notification(
    user_id: str,
    *,
    event_kind: str,
    title: str,
    body: str,
    ticket_id: str | None = None,
    ticket_subject: str | None = None,
    click_url: str | None = None,
    extra: dict | None = None,
    persist: bool = True,
) -> None:
    """
    Persist + publish a bell notification for one user.

    Fire-and-forget — never raises. Persistence is best-effort; if it
    fails we still emit the SSE event so live clients see it.

    Retention: 12 hours by default (via `expires_at`). Set
    `persist=False` to skip DB and only emit SSE.
    """
    notification_id = str(uuid4())
    now = datetime.now(timezone.utc)

    # ---- Persist (best-effort) ----
    if persist:
        try:
            from app.db.session import AsyncSessionLocal
            from app.db.models import Notification
            from datetime import timedelta

            async with AsyncSessionLocal() as db:
                row = Notification(
                    id=notification_id,
                    user_id=str(user_id),
                    event_kind=event_kind,
                    title=title[:255],
                    body=body or "",
                    ticket_id=ticket_id,
                    ticket_subject=ticket_subject[:255] if ticket_subject else None,
                    click_url=click_url[:512] if click_url else None,
                    extra=extra or {},
                    expires_at=now + timedelta(hours=12),
                )
                db.add(row)
                await db.commit()
        except Exception as e:  # noqa: BLE001
            print(f"[notify] persist notification failed: {e}")

    # ---- Publish SSE event ----
    try:
        await pubsub_service.publish(
            {
                "kind": "user_notification",
                "notification": {
                    "id": notification_id,
                    "recipient_user_id": str(user_id),
                    "event_kind": event_kind,
                    "title": title,
                    "body": body,
                    "ticket_id": ticket_id,
                    "ticket_subject": ticket_subject,
                    "click_url": click_url,
                    "extra": extra or {},
                    "at": now.isoformat(),
                },
            }
        )
    except Exception as e:  # noqa: BLE001
        print(f"[notify] push_user_notification failed: {e}")


# =====================================================================
# helpers
# =====================================================================


def _web_url() -> str:
    """Small wrapper so we don't import settings at module top."""
    from app.config.settings import settings

    return settings.web_url.rstrip("/")
