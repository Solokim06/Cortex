"""
Ticket export — CSV and JSON.

Exports tickets matching the same filters as the admin list endpoint.
CSV is a flat one-row-per-ticket layout including replies/notes/tags/events
flattened into JSON strings in dedicated columns (keeps it valid CSV).

JSON export streams the full admin detail payload per ticket.

Both callers get an async generator so we don't build giant strings in
memory. The router wraps the generator in a StreamingResponse.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import feedback as feedback_service


# ---------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------

CSV_COLUMNS = [
    "id",
    "status",
    "priority",
    "category",
    "subject",
    "description",
    "created_at",
    "updated_at",
    "resolved_at",
    "first_responded_at",
    "first_response_due_at",
    "resolution_due_at",
    "breached_any",
    "filer_id",
    "filer_email",
    "filer_name",
    "assignee_id",
    "assignee_email",
    "assignee_name",
    "last_replied_by",
    "attachment_url",
    "tags_json",
    "context_json",
    "replies_json",
    "events_json",
]


def _json_str(value) -> str:
    """Compact JSON dump, tolerant of UUIDs/datetimes."""
    if value is None:
        return ""
    try:
        return json.dumps(value, default=str, separators=(",", ":"))
    except Exception:  # noqa: BLE001
        return json.dumps({"error": "unserializable"}, separators=(",", ":"))


def _dt(value) -> str:
    return value.isoformat() if value else ""


async def export_csv(
    db: AsyncSession,
    *,
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    assigned_to_user_id: str | None = None,
    unassigned: bool = False,
    search: str | None = None,
    tag: str | None = None,
    limit: int = 5000,
) -> AsyncIterator[str]:
    """
    Yield CSV text (header first, then one row per ticket).

    Each ticket triggers additional queries for filer/assignee/replies/events/tags.
    That's O(N) queries per export — acceptable up to a few thousand rows.
    For larger exports we'd want a proper JOIN, but this is fine for now.
    """
    # Header
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(CSV_COLUMNS)
    yield buf.getvalue()

    tickets = await feedback_service.list_all_tickets(
        db,
        status=status,
        priority=priority,
        category=category,
        assigned_to_user_id=assigned_to_user_id,
        unassigned=unassigned,
        search=search,
        tag=tag,
        sort="created_asc",
        limit=limit,
        offset=0,
    )

    for t in tickets:
        detail = await feedback_service.ticket_admin_detail(db, t)
        filer = detail.get("filer") or {}
        assignee = detail.get("assignee") or {}
        sla = detail.get("sla") or {}

        row = [
            detail["id"],
            detail["status"],
            detail["priority"],
            detail["category"],
            detail["subject"],
            detail["description"],
            detail["created_at"],
            detail["updated_at"],
            detail.get("resolved_at") or "",
            detail.get("first_responded_at") or "",
            (sla.get("first_response") or {}).get("due_at") or "",
            (sla.get("resolution") or {}).get("due_at") or "",
            "true" if sla.get("breached_any") else "false",
            filer.get("id") or "",
            filer.get("email") or "",
            filer.get("name") or "",
            assignee.get("id") or "",
            assignee.get("email") or "",
            assignee.get("name") or "",
            detail.get("last_replied_by") or "",
            detail.get("attachment_url") or "",
            _json_str(detail.get("tags") or []),
            _json_str(detail.get("context") or {}),
            _json_str(detail.get("replies") or []),
            _json_str(detail.get("events") or []),
        ]

        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(row)
        yield buf.getvalue()


# ---------------------------------------------------------------------
# JSON (newline-delimited, streamed)
# ---------------------------------------------------------------------


async def export_json(
    db: AsyncSession,
    *,
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    assigned_to_user_id: str | None = None,
    unassigned: bool = False,
    search: str | None = None,
    tag: str | None = None,
    limit: int = 5000,
) -> AsyncIterator[str]:
    """
    Stream a JSON array. First chunk is `[`, then comma-separated
    ticket objects, then `]`. Uses compact encoding.
    """
    yield "[\n"

    tickets = await feedback_service.list_all_tickets(
        db,
        status=status,
        priority=priority,
        category=category,
        assigned_to_user_id=assigned_to_user_id,
        unassigned=unassigned,
        search=search,
        tag=tag,
        sort="created_asc",
        limit=limit,
        offset=0,
    )

    first = True
    for t in tickets:
        detail = await feedback_service.ticket_admin_detail(db, t)
        chunk = json.dumps(detail, default=str, separators=(",", ":"))
        if not first:
            yield ",\n"
        yield chunk
        first = False

    yield "\n]\n"


# ---------------------------------------------------------------------
# filename helper
# ---------------------------------------------------------------------


def export_filename(fmt: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    ext = "csv" if fmt == "csv" else "json"
    return f"cortex-tickets-{ts}.{ext}"
