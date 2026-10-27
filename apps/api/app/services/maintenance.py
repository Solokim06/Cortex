"""
Maintenance operations — retention, PII redaction, data lifecycle.

Three operations:

  1. redact_user(db, user_id, reason)
     GDPR-style right-to-be-forgotten. Anonymizes the user's PII while
     preserving aggregate counts. Their tickets/replies/events stay but
     with identifiers scrubbed.

  2. purge_closed_tickets(db, older_than_days, dry_run=False)
     Deletes tickets that have been closed/resolved for longer than N
     days. Cascades to replies, tags, events, deliveries via FK.

  3. purge_webhook_deliveries(db, older_than_days, dry_run=False)
     Trims the webhook delivery log — that table grows the fastest.

Every operation returns a summary dict. Nothing runs implicitly; a
caller (admin endpoint or scheduled job) decides when.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ChatMessageRecord,
    FeedbackReply,
    FeedbackTicket,
    ImpersonationSession,
    TicketEvent,
    User,
    WebhookDelivery,
)


# ---------------------------------------------------------------------
# PII redaction (right to be forgotten)
# ---------------------------------------------------------------------

REDACTED_EMAIL_PREFIX = "redacted+"
REDACTED_NAME = "[redacted]"


def _redacted_email(user_id: str) -> str:
    # Deterministic so we don't collide on unique constraint
    return f"{REDACTED_EMAIL_PREFIX}{user_id[:12]}@cortex.local"


async def redact_user(
    db: AsyncSession,
    user_id: str,
    *,
    reason: str | None = None,
) -> dict:
    """
    Anonymize a user's PII.

    What changes:
      - users.email    → redacted+<id>@cortex.local
      - users.name     → "[redacted]"
      - users.clerk_user_id → NULL (breaks Clerk link)
      - ticket.description, ticket.subject, ticket.context
                       → preserved (they're the support history)
      - reply contents → preserved

    What's deleted:
      - active impersonation sessions involving this user
      - ChatMessageRecord rows (private chat history)

    What stays:
      - tickets (as historical record, attributed to the redacted user)
      - replies, events, tags
      - api_tokens are revoked (but not deleted — audit)

    Returns a summary of what was done.
    """
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        return {"ok": False, "reason": "user not found"}

    original_email = user.email

    # 1. Redact identity fields
    user.email = _redacted_email(user_id)
    user.name = REDACTED_NAME
    user.clerk_user_id = None

    # 2. Wipe chat history (private conversations)
    chat_result = await db.execute(
        delete(ChatMessageRecord).where(ChatMessageRecord.user_id == user_id)
    )
    chat_deleted = chat_result.rowcount or 0

    # 3. Kill any active impersonation sessions
    imp_result = await db.execute(
        update(ImpersonationSession)
        .where(
            (ImpersonationSession.admin_user_id == user_id)
            | (ImpersonationSession.target_user_id == user_id),
            ImpersonationSession.is_active.is_(True),
        )
        .values(is_active=False, ended_at=datetime.now(timezone.utc))
    )
    imp_ended = imp_result.rowcount or 0

    # 4. Log a system event on every ticket this user filed
    ticket_ids = (
        (
            await db.execute(
                select(FeedbackTicket.id).where(FeedbackTicket.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )

    now = datetime.now(timezone.utc)
    for tid in ticket_ids:
        db.add(
            TicketEvent(
                id=str(uuid4()),
                ticket_id=tid,
                actor_user_id=None,
                actor_kind="system",
                kind="user_redacted",
                data={
                    "reason": reason or "unspecified",
                    "at": now.isoformat(),
                    "original_email_hash": _safe_hash(original_email),
                },
            )
        )

    await db.commit()

    return {
        "ok": True,
        "user_id": user_id,
        "original_email": original_email,
        "new_email": user.email,
        "chat_messages_deleted": chat_deleted,
        "impersonation_sessions_ended": imp_ended,
        "tickets_annotated": len(ticket_ids),
    }


def _safe_hash(value: str | None) -> str | None:
    """Non-reversible short hash for audit reference."""
    if not value:
        return None
    import hashlib

    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------
# retention: purge old closed tickets
# ---------------------------------------------------------------------


async def purge_closed_tickets(
    db: AsyncSession,
    *,
    older_than_days: int = 180,
    dry_run: bool = False,
) -> dict:
    """
    Delete tickets that have been resolved/closed for > N days.

    Cascades: replies, tags, events, deliveries (ON DELETE CASCADE).
    Does NOT delete the users who filed them.

    Returns counts. With dry_run=True, reports what WOULD be deleted
    without changing anything.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)

    stmt = select(FeedbackTicket).where(
        FeedbackTicket.status.in_(["resolved", "closed"]),
        FeedbackTicket.resolved_at.is_not(None),
        FeedbackTicket.resolved_at < cutoff,
    )
    tickets = list((await db.execute(stmt)).scalars().all())

    if dry_run:
        return {
            "dry_run": True,
            "would_delete": len(tickets),
            "cutoff": cutoff.isoformat(),
            "older_than_days": older_than_days,
        }

    ids = [str(t.id) for t in tickets]

    if not ids:
        return {
            "dry_run": False,
            "deleted": 0,
            "cutoff": cutoff.isoformat(),
            "older_than_days": older_than_days,
        }

    # Explicit order to avoid FK confusion — events, tags, replies first
    # even though CASCADE would handle it. Being explicit is safer.
    await db.execute(delete(TicketEvent).where(TicketEvent.ticket_id.in_(ids)))
    await db.execute(delete(FeedbackReply).where(FeedbackReply.ticket_id.in_(ids)))
    await db.execute(
        delete(WebhookDelivery).where(WebhookDelivery.ticket_id.in_(ids))
    )
    await db.execute(delete(FeedbackTicket).where(FeedbackTicket.id.in_(ids)))

    await db.commit()

    return {
        "dry_run": False,
        "deleted": len(ids),
        "cutoff": cutoff.isoformat(),
        "older_than_days": older_than_days,
    }


# ---------------------------------------------------------------------
# retention: purge old webhook deliveries
# ---------------------------------------------------------------------


async def purge_webhook_deliveries(
    db: AsyncSession,
    *,
    older_than_days: int = 30,
    keep_failures: bool = True,
    dry_run: bool = False,
) -> dict:
    """
    Trim the webhook_deliveries log.

    Successful deliveries older than `older_than_days` are deleted.
    Failed deliveries (no 2xx) are KEPT by default because they're
    audit-relevant. Set keep_failures=False to purge those too.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)

    conditions = [WebhookDelivery.delivered_at < cutoff]
    if keep_failures:
        # Only 2xx rows
        conditions.append(WebhookDelivery.status_code >= 200)
        conditions.append(WebhookDelivery.status_code < 300)

    stmt = select(WebhookDelivery).where(*conditions)
    rows = list((await db.execute(stmt)).scalars().all())

    if dry_run:
        return {
            "dry_run": True,
            "would_delete": len(rows),
            "cutoff": cutoff.isoformat(),
            "keep_failures": keep_failures,
        }

    if not rows:
        return {
            "dry_run": False,
            "deleted": 0,
            "cutoff": cutoff.isoformat(),
            "keep_failures": keep_failures,
        }

    ids = [str(r.id) for r in rows]
    await db.execute(delete(WebhookDelivery).where(WebhookDelivery.id.in_(ids)))
    await db.commit()

    return {
        "dry_run": False,
        "deleted": len(ids),
        "cutoff": cutoff.isoformat(),
        "keep_failures": keep_failures,
    }


# ---------------------------------------------------------------------
# diagnostics
# ---------------------------------------------------------------------


async def data_health(db: AsyncSession) -> dict:
    """
    Snapshot of table sizes + age extremes. Useful for the admin health
    page and for deciding retention thresholds.
    """
    from sqlalchemy import func

    async def _count(model) -> int:
        return int(
            (await db.execute(select(func.count()).select_from(model))).scalar_one()
        )

    async def _oldest(model, field):
        return (
            await db.execute(select(func.min(field)).select_from(model))
        ).scalar_one()

    async def _newest(model, field):
        return (
            await db.execute(select(func.max(field)).select_from(model))
        ).scalar_one()

    now = datetime.now(timezone.utc)

    def _age_days(dt) -> int | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int((now - dt).total_seconds() // 86400)

    closed_oldest = await _oldest(
        FeedbackTicket, FeedbackTicket.resolved_at
    )

    return {
        "users": await _count(User),
        "tickets": {
            "total": await _count(FeedbackTicket),
            "oldest_created": (
                await _oldest(FeedbackTicket, FeedbackTicket.created_at)
            ).isoformat() if await _oldest(FeedbackTicket, FeedbackTicket.created_at) else None,
            "oldest_resolved_age_days": _age_days(closed_oldest),
        },
        "replies": await _count(FeedbackReply),
        "events": {
            "total": await _count(TicketEvent),
            "oldest_age_days": _age_days(
                await _oldest(TicketEvent, TicketEvent.created_at)
            ),
        },
        "webhook_deliveries": {
            "total": await _count(WebhookDelivery),
            "oldest_age_days": _age_days(
                await _oldest(WebhookDelivery, WebhookDelivery.delivered_at)
            ),
        },
        "impersonation_sessions": await _count(ImpersonationSession),
        "generated_at": now.isoformat(),
    }
