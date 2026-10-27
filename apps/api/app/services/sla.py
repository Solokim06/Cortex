"""
SLA engine.

Reads policies from the `sla_policies` table (seeded from settings on
startup). Computes due dates on ticket creation and on priority change.
Detects breaches for the admin dashboard.

All math is in UTC. Timestamps in the DB are TIMESTAMPTZ. Comparisons
use timezone-aware datetimes throughout.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import FeedbackTicket, SlaPolicy

# Priority constants (kept here to avoid circular imports with feedback.py)
PRIORITY_URGENT = "urgent"
PRIORITY_HIGH = "high"
PRIORITY_NORMAL = "normal"
PRIORITY_LOW = "low"

VALID_PRIORITIES = {PRIORITY_URGENT, PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW}

# Statuses that stop the resolution clock
TERMINAL_STATUSES = {"resolved", "closed"}


# ---------------------------------------------------------------------
# time helpers
# ---------------------------------------------------------------------


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Make a naive datetime UTC-aware. Pass through if already aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------
# policy lookup
# ---------------------------------------------------------------------


async def get_policy(
    db: AsyncSession,
    priority: str,
) -> SlaPolicy | None:
    """Fetch the policy row for a priority, or None if missing."""
    if priority not in VALID_PRIORITIES:
        priority = PRIORITY_NORMAL

    result = await db.execute(
        select(SlaPolicy).where(SlaPolicy.priority == priority)
    )
    return result.scalar_one_or_none()


async def list_policies(db: AsyncSession) -> list[SlaPolicy]:
    result = await db.execute(
        select(SlaPolicy).order_by(SlaPolicy.priority)
    )
    return list(result.scalars().all())


async def ensure_policy(
    db: AsyncSession,
    priority: str,
    *,
    commit: bool = True,
) -> SlaPolicy:
    """
    Return the policy for a priority, creating it from settings defaults
    if missing. Guarantees a non-None return.
    """
    policy = await get_policy(db, priority)
    if policy is not None:
        return policy

    defaults = settings.sla_defaults()
    first_min, resolve_min = defaults.get(
        priority, defaults[PRIORITY_NORMAL]
    )

    policy = SlaPolicy(
        priority=priority,
        first_response_minutes=first_min,
        resolution_minutes=resolve_min,
    )
    db.add(policy)
    if commit:
        await db.commit()
        await db.refresh(policy)
    return policy


async def update_policy(
    db: AsyncSession,
    priority: str,
    first_response_minutes: int,
    resolution_minutes: int,
    updated_by_user_id: str | None = None,
) -> SlaPolicy | None:
    """Upsert a policy row. Used by the admin PUT endpoint."""
    if priority not in VALID_PRIORITIES:
        return None

    policy = await ensure_policy(db, priority, commit=False)
    policy.first_response_minutes = max(1, int(first_response_minutes))
    policy.resolution_minutes = max(1, int(resolution_minutes))
    policy.updated_by = updated_by_user_id

    await db.commit()
    await db.refresh(policy)
    return policy


# ---------------------------------------------------------------------
# due date computation
# ---------------------------------------------------------------------


def compute_due_dates(
    *,
    created_at: datetime,
    priority: str,
    policy: SlaPolicy,
) -> tuple[datetime, datetime]:
    """
    Return (first_response_due_at, resolution_due_at) in UTC.

    `created_at` is the ticket creation time. If None, uses now.
    """
    base = ensure_utc(created_at) or utcnow()

    # Defensive: DB might return ints, but coerce
    first_min = int(policy.first_response_minutes or 0)
    resolve_min = int(policy.resolution_minutes or 0)

    return (
        base + timedelta(minutes=first_min),
        base + timedelta(minutes=resolve_min),
    )


async def apply_sla_to_ticket(
    db: AsyncSession,
    ticket: FeedbackTicket,
    *,
    commit: bool = True,
) -> FeedbackTicket:
    """
    Compute and set due dates on a ticket based on its current priority
    and created_at. Safe to call repeatedly — it just recomputes.

    If the ticket is already resolved/closed, the resolution clock stops:
    resolution_due_at is left as-is (historical record).
    """
    policy = await ensure_policy(db, ticket.priority, commit=False)

    created = ensure_utc(ticket.created_at) or utcnow()

    first_due, resolve_due = compute_due_dates(
        created_at=created,
        priority=ticket.priority,
        policy=policy,
    )

    ticket.first_response_due_at = first_due

    # Freeze resolution clock once ticket is terminal
    if ticket.status not in TERMINAL_STATUSES:
        ticket.resolution_due_at = resolve_due

    if commit:
        await db.commit()
        await db.refresh(ticket)

    return ticket


# ---------------------------------------------------------------------
# breach detection
# ---------------------------------------------------------------------


def _is_breached(due: datetime | None, actual: datetime | None, now: datetime) -> bool:
    """
    A deadline is breached if:
      - no actual completion, AND due < now (overdue), OR
      - actual completion > due (completed late)
    """
    if due is None:
        return False
    due = ensure_utc(due)

    if actual is None:
        return due < now

    actual = ensure_utc(actual)
    return actual > due


def sla_status(ticket: FeedbackTicket, *, now: datetime | None = None) -> dict:
    """
    Compute the SLA status for a single ticket.

    Returns:
      {
        "first_response": {
            "due_at": iso | None,
            "responded_at": iso | None,
            "breached": bool,
            "seconds_remaining": int | None,   # negative if overdue
        },
        "resolution": {...same shape...},
        "breached_any": bool,
      }
    """
    n = now or utcnow()

    first_due = ensure_utc(ticket.first_response_due_at)
    first_actual = ensure_utc(ticket.first_responded_at)
    first_breached = _is_breached(first_due, first_actual, n)

    resolve_due = ensure_utc(ticket.resolution_due_at)
    resolve_actual = ensure_utc(ticket.resolved_at)
    resolve_breached = _is_breached(resolve_due, resolve_actual, n)

    def _secs(due: datetime | None, actual: datetime | None) -> int | None:
        if due is None:
            return None
        ref = actual or n
        return int((due - ref).total_seconds())

    return {
        "first_response": {
            "due_at": first_due.isoformat() if first_due else None,
            "responded_at": first_actual.isoformat() if first_actual else None,
            "breached": first_breached,
            "seconds_remaining": _secs(first_due, first_actual),
        },
        "resolution": {
            "due_at": resolve_due.isoformat() if resolve_due else None,
            "resolved_at": resolve_actual.isoformat() if resolve_actual else None,
            "breached": resolve_breached,
            "seconds_remaining": _secs(resolve_due, resolve_actual),
        },
        "breached_any": first_breached or resolve_breached,
    }


def is_breached(ticket: FeedbackTicket, *, now: datetime | None = None) -> bool:
    """Simple bool for filtering."""
    return sla_status(ticket, now=now)["breached_any"]


# ---------------------------------------------------------------------
# first-reply tracking
# ---------------------------------------------------------------------


def mark_first_response(
    ticket: FeedbackTicket,
    *,
    at: datetime | None = None,
) -> bool:
    """
    Set first_responded_at if not already set. Returns True if it was set
    by this call (i.e. this was the first team reply), False otherwise.

    Does NOT commit — caller does.
    """
    if ticket.first_responded_at is not None:
        return False
    ticket.first_responded_at = at or utcnow()
    return True
