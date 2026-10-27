"""
Macro (canned response) helpers — richer than the basic
feedback.render_macro.

Features:
  - Template variables with formatting: {{var}} and {{var|fallback}}
  - Context-aware suggestions: given a ticket, suggest macros whose
    tags overlap with the ticket's category/priority/tags.
  - Bulk render: given many tickets, preview the rendered macro for each
    so the admin can review before sending.
  - Usage stats: which macros get used most (reads ticket events).

The heavy lifting (DB CRUD) lives in feedback.py. This module is the
"apply a macro to a ticket" layer.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CannedResponse, FeedbackTicket, TicketEvent, User
from app.services import feedback as feedback_service


# ---------------------------------------------------------------------
# variables
# ---------------------------------------------------------------------

# Matches {{ key }} or {{ key|fallback text }}
_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|([^}]*))?\}\}")


def _resolve_var(
    key: str,
    fallback: str | None,
    values: dict[str, str],
) -> str:
    """
    Return the value for a variable, or the fallback, or leave the
    placeholder intact so authors can spot typos.
    """
    v = values.get(key)
    if v is not None and v != "":
        return v
    if fallback is not None:
        return fallback.strip()
    # Unknown / empty → leave the placeholder for visibility
    return "{{" + key + "}}"


def render(
    body: str,
    *,
    filer_name: str | None = None,
    filer_email: str | None = None,
    filer_id: str | None = None,
    ticket_id: str | None = None,
    ticket_subject: str | None = None,
    ticket_category: str | None = None,
    ticket_priority: str | None = None,
    ticket_status: str | None = None,
    admin_name: str | None = None,
    admin_email: str | None = None,
    workspace_name: str = "Cortex",
) -> str:
    """
    Substitute {{var}} and {{var|fallback}} placeholders.

    Supported variables:
      filer_name, filer_email, filer_id
      ticket_id, ticket_subject, ticket_category,
      ticket_priority, ticket_status
      admin_name, admin_email
      workspace_name
      date              — today, ISO
      datetime          — now, ISO with time
      greeting          — "Hi <filer_name>," (or "Hi there,")
    """
    now = datetime.now(timezone.utc)

    values: dict[str, str] = {
        "filer_name": (filer_name or "").strip(),
        "filer_email": (filer_email or "").strip(),
        "filer_id": (filer_id or "").strip(),
        "ticket_id": (ticket_id or "").strip(),
        "ticket_subject": (ticket_subject or "").strip(),
        "ticket_category": (ticket_category or "").strip(),
        "ticket_priority": (ticket_priority or "").strip(),
        "ticket_status": (ticket_status or "").strip(),
        "admin_name": (admin_name or "").strip(),
        "admin_email": (admin_email or "").strip(),
        "workspace_name": workspace_name,
        "date": now.date().isoformat(),
        "datetime": now.isoformat(),
    }

    # Greeting is derived — if filer_name missing, "Hi there,".
    name = values["filer_name"] or "there"
    values["greeting"] = f"Hi {name},"

    def _sub(match: re.Match) -> str:
        key = match.group(1)
        fallback = match.group(2)
        return _resolve_var(key, fallback, values)

    return _VAR_RE.sub(_sub, body)


# ---------------------------------------------------------------------
# build context from a ticket
# ---------------------------------------------------------------------


async def _context_from_ticket(
    db: AsyncSession,
    ticket: FeedbackTicket,
    actor_user_id: str,
) -> dict[str, str | None]:
    filer = await feedback_service.get_user_by_id(db, ticket.user_id)
    actor = await feedback_service.get_user_by_id(db, actor_user_id)

    return {
        "filer_name": filer.name if filer else None,
        "filer_email": filer.email if filer else None,
        "filer_id": str(filer.id) if filer else None,
        "ticket_id": str(ticket.id),
        "ticket_subject": ticket.subject,
        "ticket_category": ticket.category,
        "ticket_priority": ticket.priority,
        "ticket_status": ticket.status,
        "admin_name": actor.name if actor else None,
        "admin_email": actor.email if actor else None,
    }


# ---------------------------------------------------------------------
# render one macro against one ticket (preview)
# ---------------------------------------------------------------------


async def preview(
    db: AsyncSession,
    *,
    ticket_id: str,
    macro_id: str,
    actor_user_id: str,
    override_body: str | None = None,
) -> dict | None:
    """
    Render a macro for a ticket without posting it. Returns:
      {
        "macro_id": ..., "ticket_id": ...,
        "title": ..., "rendered": "...",
      }
    """
    ticket = await feedback_service.get_ticket_any(db, ticket_id)
    if ticket is None:
        return None

    macro = await feedback_service.get_macro(db, macro_id)
    if macro is None:
        return None

    ctx = await _context_from_ticket(db, ticket, actor_user_id)
    body = override_body if override_body is not None else macro.body
    rendered = render(body, **ctx)

    return {
        "macro_id": str(macro.id),
        "macro_title": macro.title,
        "ticket_id": str(ticket.id),
        "rendered": rendered,
    }


# ---------------------------------------------------------------------
# suggestions — pick macros whose tags match the ticket
# ---------------------------------------------------------------------


async def suggest_for_ticket(
    db: AsyncSession,
    ticket_id: str,
    *,
    limit: int = 5,
) -> list[CannedResponse]:
    """
    Rank macros by tag overlap with the ticket's:
      - category (e.g. "bug")
      - priority (e.g. "high")
      - applied tags (e.g. "billing")
    Falls back to returning the most recent macros if nothing matches.
    """
    ticket = await feedback_service.get_ticket_any(db, ticket_id)
    if ticket is None:
        return []

    ticket_tags = set(await feedback_service.list_tags(db, ticket_id))
    ticket_tags.add(ticket.category)
    ticket_tags.add(ticket.priority)

    # Fetch all macros — small table, cheap to scan
    result = await db.execute(select(CannedResponse))
    all_macros = list(result.scalars().all())

    if not all_macros:
        return []

    def _score(m: CannedResponse) -> int:
        m_tags = set((m.tags or []))
        return len(m_tags & ticket_tags)

    scored = sorted(all_macros, key=_score, reverse=True)
    # Only return macros with any tag overlap; if none match, return nothing
    with_match = [m for m in scored if _score(m) > 0]
    if with_match:
        return with_match[:limit]

    return []


# ---------------------------------------------------------------------
# usage stats
# ---------------------------------------------------------------------


async def usage_stats(
    db: AsyncSession,
    *,
    limit: int = 20,
) -> list[dict]:
    """
    Count how often each macro was used.

    We infer "used" from ticket events of kind=replied where the event
    data contains a macro_id — see reply_with_macro in feedback.py which
    does NOT currently record macro_id, so usage here counts replies
    whose data.reply_id matches an event, grouped by macro_id if present.

    For simplicity this returns 0 for macros we can't attribute; when
    reply_with_macro starts storing macro_id we'll pick it up automatically.
    """
    # Grab events with a macro_id in data
    result = await db.execute(
        select(TicketEvent).where(TicketEvent.kind == "replied")
    )
    events = list(result.scalars().all())

    counts: dict[str, int] = {}
    for e in events:
        data = e.data or {}
        mid = data.get("macro_id")
        if mid:
            counts[mid] = counts.get(mid, 0) + 1

    # Load macro titles
    macro_ids = list(counts.keys())
    if not macro_ids:
        return []

    macros_res = await db.execute(
        select(CannedResponse).where(CannedResponse.id.in_(macro_ids))
    )
    macros = {str(m.id): m for m in macros_res.scalars().all()}

    rows = [
        {
            "macro_id": mid,
            "title": macros[mid].title if mid in macros else "(deleted)",
            "uses": count,
        }
        for mid, count in counts.items()
    ]
    rows.sort(key=lambda r: r["uses"], reverse=True)
    return rows[:limit]


# ---------------------------------------------------------------------
# bulk preview
# ---------------------------------------------------------------------


async def preview_for_tickets(
    db: AsyncSession,
    *,
    ticket_ids: list[str],
    macro_id: str,
    actor_user_id: str,
) -> list[dict]:
    """
    Render a macro against many tickets at once — for the "send to all
    selected" flow where each ticket gets its own personalized body.
    """
    macro = await feedback_service.get_macro(db, macro_id)
    if macro is None:
        raise ValueError("Macro not found")

    out: list[dict] = []
    for tid in ticket_ids:
        ticket = await feedback_service.get_ticket_any(db, tid)
        if ticket is None:
            out.append({"ticket_id": tid, "error": "not found"})
            continue

        ctx = await _context_from_ticket(db, ticket, actor_user_id)
        out.append(
            {
                "ticket_id": str(ticket.id),
                "subject": ticket.subject,
                "rendered": render(macro.body, **ctx),
            }
        )
    return out
