"""
Admin notification preferences + placeholder email service.

Prefs are per-user flags saying which events should notify them:
  - email_on_new_ticket       — a new ticket lands in the queue
  - email_on_assignment       — a ticket is assigned to them
  - email_on_user_reply       — the filer replied to their ticket
  - email_on_sla_breach       — one of their tickets breached SLA
  - email_digest_daily        — a 24h summary (not implemented yet)

Emails are NOT actually sent yet. `send_email()` logs instead, so the
whole flow (prefs read → notify → log) is exercised and easy to swap
for real SMTP/SendGrid/Resend later. When you're ready, replace the
body of `send_email()` with a real call — nothing else changes.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AdminNotificationPrefs, User


# ---------------------------------------------------------------------
# defaults + retrieval
# ---------------------------------------------------------------------


def _default_prefs_row(user_id: str) -> AdminNotificationPrefs:
    return AdminNotificationPrefs(
        user_id=user_id,
        email_on_new_ticket=True,
        email_on_assignment=True,
        email_on_user_reply=True,
        email_on_sla_breach=True,
        email_digest_daily=False,
    )


async def get_prefs(
    db: AsyncSession,
    user_id: str,
) -> AdminNotificationPrefs:
    """
    Return the user's prefs, creating a default row if missing.
    """
    result = await db.execute(
        select(AdminNotificationPrefs).where(
            AdminNotificationPrefs.user_id == user_id
        )
    )
    prefs = result.scalar_one_or_none()
    if prefs is not None:
        return prefs

    prefs = _default_prefs_row(user_id)
    db.add(prefs)
    await db.commit()
    await db.refresh(prefs)
    return prefs


async def update_prefs(
    db: AsyncSession,
    user_id: str,
    *,
    email_on_new_ticket: bool | None = None,
    email_on_assignment: bool | None = None,
    email_on_user_reply: bool | None = None,
    email_on_sla_breach: bool | None = None,
    email_digest_daily: bool | None = None,
) -> AdminNotificationPrefs:
    """
    Patch the prefs. Any field left None is unchanged.
    """
    prefs = await get_prefs(db, user_id)

    if email_on_new_ticket is not None:
        prefs.email_on_new_ticket = email_on_new_ticket
    if email_on_assignment is not None:
        prefs.email_on_assignment = email_on_assignment
    if email_on_user_reply is not None:
        prefs.email_on_user_reply = email_on_user_reply
    if email_on_sla_breach is not None:
        prefs.email_on_sla_breach = email_on_sla_breach
    if email_digest_daily is not None:
        prefs.email_digest_daily = email_digest_daily

    prefs.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(prefs)
    return prefs


def prefs_to_dict(p: AdminNotificationPrefs) -> dict:
    return {
        "user_id": str(p.user_id),
        "email_on_new_ticket": p.email_on_new_ticket,
        "email_on_assignment": p.email_on_assignment,
        "email_on_user_reply": p.email_on_user_reply,
        "email_on_sla_breach": p.email_on_sla_breach,
        "email_digest_daily": p.email_digest_daily,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# ---------------------------------------------------------------------
# recipient resolution
# ---------------------------------------------------------------------


async def recipients_for_new_ticket(db: AsyncSession) -> list[User]:
    """All admins/agents who want an email when a new ticket lands."""
    return await _recipients_for_flag(db, "email_on_new_ticket")


async def recipients_for_assignment(
    db: AsyncSession,
    assignee_user_id: str,
) -> list[User]:
    """The assignee, if they have the flag on."""
    result = await db.execute(
        select(User).where(User.id == assignee_user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        return []

    prefs = await get_prefs(db, assignee_user_id)
    if not prefs.email_on_assignment:
        return []
    return [user]


async def recipients_for_user_reply(
    db: AsyncSession,
    assignee_user_id: str | None,
) -> list[User]:
    """The assignee (if any), if they have the flag on."""
    if not assignee_user_id:
        return []

    result = await db.execute(select(User).where(User.id == assignee_user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return []

    prefs = await get_prefs(db, assignee_user_id)
    if not prefs.email_on_user_reply:
        return []
    return [user]


async def recipients_for_sla_breach(
    db: AsyncSession,
    assignee_user_id: str | None,
) -> list[User]:
    """
    The assignee if set, else all admins/agents who have the flag on.
    """
    flag = "email_on_sla_breach"

    if assignee_user_id:
        result = await db.execute(select(User).where(User.id == assignee_user_id))
        user = result.scalar_one_or_none()
        if user is not None:
            prefs = await get_prefs(db, assignee_user_id)
            if getattr(prefs, flag):
                return [user]
            # Assignee opted out — don't spam the whole team.
            return []

    return await _recipients_for_flag(db, flag)


async def _recipients_for_flag(
    db: AsyncSession,
    flag: str,
) -> list[User]:
    """
    Return all admins/agents whose prefs have the given flag on.
    Users with no prefs row yet get defaults (all True except digest).
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

    default_on = True  # matches _default_prefs_row for the four event flags
    out: list[User] = []
    for u in users:
        p = prefs_by_user.get(str(u.id))
        if p is None:
            if default_on:
                out.append(u)
            continue
        if getattr(p, flag, default_on):
            out.append(u)
    return out


# ---------------------------------------------------------------------
# email (stub — logs only for now)
# ---------------------------------------------------------------------

_sent_log: list[dict] = []  # ring buffer for /admin/maintenance/debug


async def send_email(
    to: str,
    subject: str,
    body: str,
    *,
    reply_to: str | None = None,
) -> dict:
    """
    Send an email. Currently logs instead of sending.

    Replace the body of this function with a real send (SMTP, Resend,
    Postmark, etc.) when you're ready. The rest of the codebase doesn't
    need to change — this is the seam.
    """
    entry = {
        "id": str(uuid4()),
        "to": to,
        "subject": subject,
        "body_preview": body[:200],
        "reply_to": reply_to,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "stub": True,
    }
    print(
        f"[email-stub] → {to} | {subject} | {len(body)} chars"
    )
    _sent_log.append(entry)
    if len(_sent_log) > 200:
        _sent_log.pop(0)
    return entry


def recent_sent(limit: int = 20) -> list[dict]:
    """Recent stub sends — for a debug endpoint."""
    return list(reversed(_sent_log))[:limit]


# ---------------------------------------------------------------------
# high-level notify helpers — called by services that mutate tickets
# ---------------------------------------------------------------------


async def notify_new_ticket(
    db: AsyncSession,
    *,
    ticket_id: str,
    subject: str,
    filer_email: str,
) -> int:
    """Email all opted-in admins/agents about a new ticket."""
    recipients = await recipients_for_new_ticket(db)
    for u in recipients:
        await send_email(
            to=u.email,
            subject=f"[Cortex] New ticket: {subject}",
            body=(
                f"A new support ticket was filed.\n\n"
                f"Ticket: {ticket_id}\n"
                f"From:   {filer_email}\n"
                f"Subject: {subject}\n\n"
                f"Open the admin dashboard to triage it."
            ),
        )
    return len(recipients)


async def notify_assignment(
    db: AsyncSession,
    *,
    ticket_id: str,
    subject: str,
    assignee_user_id: str,
    assigned_by_name: str | None,
) -> int:
    recipients = await recipients_for_assignment(db, assignee_user_id)
    for u in recipients:
        await send_email(
            to=u.email,
            subject=f"[Cortex] Assigned to you: {subject}",
            body=(
                f"Ticket {ticket_id} was assigned to you"
                + (f" by {assigned_by_name}" if assigned_by_name else "")
                + f".\n\nSubject: {subject}"
            ),
        )
    return len(recipients)


async def notify_user_reply(
    db: AsyncSession,
    *,
    ticket_id: str,
    subject: str,
    assignee_user_id: str | None,
    filer_email: str,
) -> int:
    recipients = await recipients_for_user_reply(db, assignee_user_id)
    for u in recipients:
        await send_email(
            to=u.email,
            subject=f"[Cortex] User replied: {subject}",
            body=(
                f"{filer_email} replied on ticket {ticket_id}.\n\n"
                f"Subject: {subject}"
            ),
        )
    return len(recipients)


async def notify_sla_breach(
    db: AsyncSession,
    *,
    ticket_id: str,
    subject: str,
    category: str,
    assignee_user_id: str | None,
) -> int:
    recipients = await recipients_for_sla_breach(db, assignee_user_id)
    for u in recipients:
        await send_email(
            to=u.email,
            subject=f"[Cortex] SLA breached ({category}): {subject}",
            body=(
                f"Ticket {ticket_id} breached its {category} SLA.\n\n"
                f"Subject: {subject}\n\n"
                f"Please review as soon as possible."
            ),
        )
    return len(recipients)
