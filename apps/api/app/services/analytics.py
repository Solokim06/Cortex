"""
Analytics service — read-only aggregations over feedback_tickets
and ticket_events.

All functions accept a (start, end) window. Callers compute the window
from either a preset (days=30) or explicit from/to dates.

No new tables, no materialized views — everything derives from the
existing event log and ticket rows.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    FeedbackTicket,
    TicketEvent,
    TicketTag,
    User,
)


# =====================================================================
# window helper
# =====================================================================


def resolve_window(
    *,
    days: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> tuple[datetime, datetime]:
    """
    Return a (start, end) UTC window.

    Precedence:
      1. explicit from_date / to_date (ISO YYYY-MM-DD or full ISO)
      2. days (defaults to 30 if nothing given)

    `to_date` is inclusive — we add 23:59:59 to cover the whole day.
    """
    now = datetime.now(timezone.utc)

    if from_date or to_date:
        try:
            start = _parse_date(from_date) if from_date else now - timedelta(days=30)
        except ValueError:
            start = now - timedelta(days=30)
        try:
            end = _parse_date(to_date, end_of_day=True) if to_date else now
        except ValueError:
            end = now
        if end < start:
            start, end = end, start
        return start, end

    d = days if days is not None else 30
    d = max(1, min(d, 365))
    return now - timedelta(days=d), now


def _parse_date(value: str, *, end_of_day: bool = False) -> datetime:
    v = value.strip()
    # Try YYYY-MM-DD
    if len(v) == 10:
        dt = datetime.strptime(v, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if end_of_day:
            dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        return dt
    # Try full ISO
    dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# =====================================================================
# overview
# =====================================================================


async def overview(
    db: AsyncSession,
    *,
    start: datetime,
    end: datetime,
) -> dict:
    """
    Headline metrics for the range.

    Returns:
      {
        range: { start, end, days },
        counts: {
          total,              # total tickets ever
          created_in_range,   # created within window
          resolved_in_range,  # resolved/closed within window
          open, in_progress, resolved, closed,   # current state
        },
        times: {
          median_first_response_minutes,
          p95_first_response_minutes,
          median_resolution_minutes,
          p95_resolution_minutes,
        },
        sla: {
          compliance_pct,
          breached_open,
          met_in_range,
          breached_in_range,
        },
      }
    """
    # --- Current state counts (unaffected by window) ---
    total = await _scalar(db, select(func.count()).select_from(FeedbackTicket))

    current_by_status: dict[str, int] = {}
    for status in ("open", "in_progress", "resolved", "closed"):
        n = await _scalar(
            db,
            select(func.count())
            .select_from(FeedbackTicket)
            .where(FeedbackTicket.status == status),
        )
        current_by_status[status] = n

    # --- In-range counts ---
    created_in_range = await _scalar(
        db,
        select(func.count())
        .select_from(FeedbackTicket)
        .where(FeedbackTicket.created_at >= start, FeedbackTicket.created_at <= end),
    )

    resolved_in_range = await _scalar(
        db,
        select(func.count())
        .select_from(FeedbackTicket)
        .where(
            FeedbackTicket.resolved_at.is_not(None),
            FeedbackTicket.resolved_at >= start,
            FeedbackTicket.resolved_at <= end,
        ),
    )

    # --- Time-to-first-response and resolution (in-range tickets only) ---
    # We compute from the ticket rows directly since we store both
    # first_responded_at and resolved_at.
    first_response_rows = (
        await db.execute(
            select(
                FeedbackTicket.created_at,
                FeedbackTicket.first_responded_at,
            )
            .where(
                FeedbackTicket.first_responded_at.is_not(None),
                FeedbackTicket.created_at >= start,
                FeedbackTicket.created_at <= end,
            )
        )
    ).all()

    first_response_minutes = [
        (r[1] - r[0]).total_seconds() / 60
        for r in first_response_rows
        if r[1] and r[0]
    ]

    resolution_rows = (
        await db.execute(
            select(
                FeedbackTicket.created_at,
                FeedbackTicket.resolved_at,
            )
            .where(
                FeedbackTicket.resolved_at.is_not(None),
                FeedbackTicket.resolved_at >= start,
                FeedbackTicket.resolved_at <= end,
            )
        )
    ).all()

    resolution_minutes = [
        (r[1] - r[0]).total_seconds() / 60
        for r in resolution_rows
        if r[1] and r[0]
    ]

    # --- SLA compliance (of tickets resolved in-range) ---
    sla_met_in_range = 0
    sla_breached_in_range = 0

    sla_rows = (
        await db.execute(
            select(
                FeedbackTicket.first_response_due_at,
                FeedbackTicket.first_responded_at,
                FeedbackTicket.resolution_due_at,
                FeedbackTicket.resolved_at,
            )
            .where(
                FeedbackTicket.resolved_at.is_not(None),
                FeedbackTicket.resolved_at >= start,
                FeedbackTicket.resolved_at <= end,
            )
        )
    ).all()

    for first_due, first_actual, resolve_due, resolve_actual in sla_rows:
        first_met = (
            first_due is None
            or first_actual is None
            or _ensure_tz(first_actual) <= _ensure_tz(first_due)
        )
        resolve_met = (
            resolve_due is None
            or resolve_actual is None
            or _ensure_tz(resolve_actual) <= _ensure_tz(resolve_due)
        )
        if first_met and resolve_met:
            sla_met_in_range += 1
        else:
            sla_breached_in_range += 1

    total_sla = sla_met_in_range + sla_breached_in_range
    compliance_pct = (
        round((sla_met_in_range / total_sla) * 100, 1) if total_sla > 0 else None
    )

    # Currently open + breached
    now = datetime.now(timezone.utc)
    open_tickets_res = await db.execute(
        select(FeedbackTicket).where(
            FeedbackTicket.status.in_(["open", "in_progress"])
        )
    )
    breached_open = 0
    for t in open_tickets_res.scalars().all():
        if _is_breached_now(t, now):
            breached_open += 1

    # --- Compute stats ---
    def _stats(values: list[float]) -> tuple[float | None, float | None]:
        if not values:
            return None, None
        s = sorted(values)
        n = len(s)
        median = s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2
        p95 = s[min(n - 1, int(n * 0.95))]
        return round(median, 1), round(p95, 1)

    median_fr, p95_fr = _stats(first_response_minutes)
    median_res, p95_res = _stats(resolution_minutes)

    window_days = max(1, (end - start).days + 1)

    return {
        "range": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "days": window_days,
        },
        "counts": {
            "total": total,
            "created_in_range": created_in_range,
            "resolved_in_range": resolved_in_range,
            "open": current_by_status["open"],
            "in_progress": current_by_status["in_progress"],
            "resolved": current_by_status["resolved"],
            "closed": current_by_status["closed"],
        },
        "times": {
            "median_first_response_minutes": median_fr,
            "p95_first_response_minutes": p95_fr,
            "median_resolution_minutes": median_res,
            "p95_resolution_minutes": p95_res,
        },
        "sla": {
            "compliance_pct": compliance_pct,
            "breached_open": breached_open,
            "met_in_range": sla_met_in_range,
            "breached_in_range": sla_breached_in_range,
        },
    }


# =====================================================================
# timeseries
# =====================================================================


async def timeseries(
    db: AsyncSession,
    *,
    start: datetime,
    end: datetime,
    granularity: Literal["day", "hour"] = "day",
) -> list[dict]:
    """
    Return per-bucket created and resolved counts.

    Buckets are UTC. Missing days are filled with zeros so charts
    render a continuous line.
    """
    # Postgres date_trunc works for both day and hour
    bucket_expr = func.date_trunc(granularity, FeedbackTicket.created_at)

    created_rows = (
        await db.execute(
            select(
                bucket_expr.label("bucket"),
                func.count().label("n"),
            )
            .where(
                FeedbackTicket.created_at >= start,
                FeedbackTicket.created_at <= end,
            )
            .group_by("bucket")
            .order_by("bucket")
        )
    ).all()

    created_by_bucket = {r[0].isoformat(): r[1] for r in created_rows}

    bucket_expr2 = func.date_trunc(granularity, FeedbackTicket.resolved_at)
    resolved_rows = (
        await db.execute(
            select(
                bucket_expr2.label("bucket"),
                func.count().label("n"),
            )
            .where(
                FeedbackTicket.resolved_at.is_not(None),
                FeedbackTicket.resolved_at >= start,
                FeedbackTicket.resolved_at <= end,
            )
            .group_by("bucket")
            .order_by("bucket")
        )
    ).all()

    resolved_by_bucket = {r[0].isoformat(): r[1] for r in resolved_rows}

    # Fill missing buckets
    out = []
    step = timedelta(days=1) if granularity == "day" else timedelta(hours=1)
    cursor = _truncate(start, granularity)
    end_trunc = _truncate(end, granularity)

    while cursor <= end_trunc:
        key = cursor.isoformat()
        out.append(
            {
                "date": cursor.date().isoformat() if granularity == "day" else cursor.isoformat(),
                "created": created_by_bucket.get(key, 0),
                "resolved": resolved_by_bucket.get(key, 0),
            }
        )
        cursor = cursor + step

    return out


def _truncate(dt: datetime, granularity: str) -> datetime:
    if granularity == "day":
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return dt.replace(minute=0, second=0, microsecond=0)


# =====================================================================
# breakdown
# =====================================================================


async def breakdown(
    db: AsyncSession,
    *,
    start: datetime,
    end: datetime,
) -> dict:
    """
    Distribution of tickets in-range across categories, priorities,
    and tags.
    """
    base_filters = [
        FeedbackTicket.created_at >= start,
        FeedbackTicket.created_at <= end,
    ]

    # By category
    cat_rows = (
        await db.execute(
            select(FeedbackTicket.category, func.count())
            .where(*base_filters)
            .group_by(FeedbackTicket.category)
            .order_by(func.count().desc())
        )
    ).all()
    by_category = [{"key": r[0], "count": r[1]} for r in cat_rows]

    # By priority
    pri_rows = (
        await db.execute(
            select(FeedbackTicket.priority, func.count())
            .where(*base_filters)
            .group_by(FeedbackTicket.priority)
            .order_by(func.count().desc())
        )
    ).all()
    by_priority = [{"key": r[0], "count": r[1]} for r in pri_rows]

    # By tag — needs a join on ticket_tags
    tag_rows = (
        await db.execute(
            select(TicketTag.tag, func.count())
            .join(FeedbackTicket, FeedbackTicket.id == TicketTag.ticket_id)
            .where(*base_filters)
            .group_by(TicketTag.tag)
            .order_by(func.count().desc())
            .limit(10)
        )
    ).all()
    by_tag = [{"key": r[0], "count": r[1]} for r in tag_rows]

    return {
        "by_category": by_category,
        "by_priority": by_priority,
        "by_tag": by_tag,
    }


# =====================================================================
# at-risk tickets
# =====================================================================


async def at_risk(
    db: AsyncSession,
    *,
    within_minutes: int = 60,
) -> list[dict]:
    """
    Open/in_progress tickets whose next SLA deadline is within
    `within_minutes`, OR already breached.

    Returns items sorted by urgency (most overdue first).
    """
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(minutes=within_minutes)

    open_res = await db.execute(
        select(FeedbackTicket).where(
            FeedbackTicket.status.in_(["open", "in_progress"])
        )
    )
    tickets = list(open_res.scalars().all())

    out: list[dict] = []

    # Preload assignees for display
    assignee_ids = {str(t.assigned_to_user_id) for t in tickets if t.assigned_to_user_id}
    assignees: dict[str, User] = {}
    if assignee_ids:
        rows = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        assignees = {str(u.id): u for u in rows}

    for t in tickets:
        first_due = _ensure_tz(t.first_response_due_at) if t.first_response_due_at else None
        first_met = t.first_responded_at is not None
        resolve_due = _ensure_tz(t.resolution_due_at) if t.resolution_due_at else None

        cat: str | None = None
        due: datetime | None = None
        seconds_remaining: int | None = None

        if not first_met and first_due is not None:
            if first_due <= cutoff:
                cat = "first_response"
                due = first_due
                seconds_remaining = int((first_due - now).total_seconds())

        if cat is None and resolve_due is not None:
            if resolve_due <= cutoff:
                cat = "resolution"
                due = resolve_due
                seconds_remaining = int((resolve_due - now).total_seconds())

        if cat is None:
            continue

        assignee = assignees.get(str(t.assigned_to_user_id)) if t.assigned_to_user_id else None

        out.append(
            {
                "ticket_id": str(t.id),
                "subject": t.subject,
                "category": t.category,
                "priority": t.priority,
                "status": t.status,
                "sla_category": cat,
                "due_at": due.isoformat() if due else None,
                "seconds_remaining": seconds_remaining,
                "assignee_email": assignee.email if assignee else None,
                "assignee_name": assignee.name if assignee else None,
            }
        )

    # Sort by most urgent (largest negative seconds = most overdue)
    out.sort(key=lambda x: x.get("seconds_remaining") or 0)
    return out


# =====================================================================
# helpers
# =====================================================================


async def _scalar(db: AsyncSession, stmt):
    r = await db.execute(stmt)
    return int(r.scalar_one())


def _ensure_tz(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _is_breached_now(ticket: FeedbackTicket, now: datetime) -> bool:
    first_due = _ensure_tz(ticket.first_response_due_at)
    first_met = ticket.first_responded_at is not None
    if first_due and not first_met and first_due < now:
        return True

    resolve_due = _ensure_tz(ticket.resolution_due_at)
    resolved = ticket.resolved_at is not None
    if resolve_due and not resolved and resolve_due < now:
        return True

    return False
