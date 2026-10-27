"""
Inbound email handler — reply-by-email.

Flow:
  1. Provider (Postmark Inbound by default) POSTs a JSON payload to
     /inbound/email.
  2. Router verifies the shared secret.
  3. This service:
       - parses `reply+<ticket-id>@<domain>` out of the To: field
       - resolves the sender to a User by email
       - verifies the sender is the ticket's filer
       - appends the body as a user reply on that ticket
       - fires admin notifications (email + in-app bell)

Never raises — returns {"ok": bool, "reason": str}. The router always
returns 200 so the provider doesn't retry-storm on bad payloads.
"""

from __future__ import annotations

import re
from email.utils import parseaddr

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FeedbackTicket, User
from app.services import feedback as feedback_service
from app.services import notifications as notifications_service


# ticket ids are uuid4 hex-with-dashes — 36 chars
_REPLY_RE = re.compile(
    r"reply\+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})@",
    re.IGNORECASE,
)


def extract_ticket_id(to_field: str) -> str | None:
    """
    Return the ticket id embedded in a `reply+<id>@domain` address,
    or None if the address doesn't match.
    """
    if not to_field:
        return None
    m = _REPLY_RE.search(to_field)
    if not m:
        return None
    return m.group(1).lower()


def extract_sender_email(from_field: str) -> str | None:
    """Parse `"Name" <addr@host>` → `addr@host` (lowercased)."""
    if not from_field:
        return None
    _, addr = parseaddr(from_field)
    addr = (addr or "").strip().lower()
    return addr or None


def strip_quoted_reply(body: str) -> str:
    """
    Best-effort removal of the quoted original message.

    Handles the common patterns:
      - "On <date>, <name> wrote:"  (Gmail / Apple Mail)
      - "-----Original Message-----" (Outlook)
      - long runs of "> " quoted lines
    """
    if not body:
        return body

    # Cut at the first quote-marker we find
    patterns = [
        r"\n-{2,}\s*Original Message\s*-{2,}",
        r"\nOn .{10,200}wrote:\s*\n",
        r"\nFrom:\s.+\nSent:\s",
    ]
    earliest = len(body)
    for pat in patterns:
        m = re.search(pat, body)
        if m and m.start() < earliest:
            earliest = m.start()
    trimmed = body[:earliest]

    # Drop trailing runs of quoted lines
    lines = trimmed.splitlines()
    while lines and (lines[-1].startswith(">") or not lines[-1].strip()):
        lines.pop()
    return "\n".join(lines).strip() or body.strip()


async def handle_inbound_email(db: AsyncSession, payload: dict) -> dict:
    """
    Given a normalized inbound payload:
        {
          "From": "Name <user@example.com>",
          "To":   "reply+<ticket-id>@inbound.cortex.local",
          "Subject": "Re: ...",
          "TextBody": "the reply text",
        }

    Appends a user reply and notifies admins. Returns:
        {"ok": True,  "ticket_id": "...", "reply_id": "..."}
        {"ok": False, "reason": "..."}
    """
    to_field = payload.get("To") or payload.get("to") or ""
    from_field = payload.get("From") or payload.get("from") or ""
    body = (
        payload.get("TextBody")
        or payload.get("text")
        or payload.get("StrippedTextReply")
        or ""
    )

    ticket_id = extract_ticket_id(to_field)
    if not ticket_id:
        return {"ok": False, "reason": "no_ticket_id_in_to_field"}

    sender_email = extract_sender_email(from_field)
    if not sender_email:
        return {"ok": False, "reason": "no_sender_email"}

    # Resolve the sender to a User
    user_res = await db.execute(
        select(User).where(User.email == sender_email)
    )
    user = user_res.scalar_one_or_none()
    if user is None:
        return {"ok": False, "reason": "unknown_sender"}

    # Load the ticket — must belong to this user
    ticket_res = await db.execute(
        select(FeedbackTicket).where(FeedbackTicket.id == ticket_id)
    )
    ticket = ticket_res.scalar_one_or_none()
    if ticket is None:
        return {"ok": False, "reason": "unknown_ticket"}
    if str(ticket.user_id) != str(user.id):
        return {"ok": False, "reason": "sender_not_filer"}

    clean_body = strip_quoted_reply(body)
    if not clean_body:
        return {"ok": False, "reason": "empty_body"}

    # Append the reply as the user
    reply = await feedback_service.add_user_reply(
        db=db,
        user_id=user.id,
        ticket_id=ticket_id,
        content=clean_body,
    )
    if reply is None:
        return {"ok": False, "reason": "reply_failed"}

    # Notify admins/assignee (email + in-app bell handled downstream)
    try:
        await notifications_service.notify_user_reply(
            db,
            ticket,
            reply_content=clean_body,
            reply_author_user_id=str(user.id),
        )
    except Exception as e:  # noqa: BLE001
        print(f"[inbound_email] notify_user_reply failed: {e}")

    print(
        f"[inbound_email] reply appended to ticket {ticket_id} "
        f"from {sender_email}"
    )
    return {
        "ok": True,
        "ticket_id": ticket_id,
        "reply_id": str(reply.id),
    }
