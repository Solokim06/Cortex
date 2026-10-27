"""
Tier 3 admin migration — idempotent.

Adds:
  - users.role
  - feedback_tickets.{priority, assigned_to_user_id, last_replied_by,
                       first_responded_at, first_response_due_at,
                       resolution_due_at}
  - Tables: ticket_events, ticket_tags, canned_responses, sla_policies,
            webhook_targets, webhook_deliveries, impersonation_sessions
  - Indexes on the new columns
  - Seeds sla_policies from settings if empty

Safe to run multiple times. Uses IF NOT EXISTS everywhere.
"""

import asyncio
import sys
from pathlib import Path

# Allow running as `python scripts/migrate_admin_tier3.py` from apps/api
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.config.settings import settings  # noqa: E402
from app.db.session import engine  # noqa: E402


# ---------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------


async def _column_exists(conn, table: str, column: str) -> bool:
    q = text(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = :t
          AND column_name = :c
        """
    )
    res = await conn.execute(q, {"t": table, "c": column})
    return res.first() is not None


async def _table_exists(conn, table: str) -> bool:
    q = text(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = :t
        """
    )
    res = await conn.execute(q, {"t": table})
    return res.first() is not None


async def _index_exists(conn, index: str) -> bool:
    q = text(
        "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :i"
    )
    res = await conn.execute(q, {"i": index})
    return res.first() is not None


async def _add_column(conn, table: str, column: str, ddl: str) -> None:
    """
    Add column if missing. Runs the ALTER unconditionally guarded by a
    try/except so a false-positive from information_schema can't stop us.
    """
    try:
        await conn.execute(
            text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS {ddl}')
        )
        print(f"  + {table}.{column}")
    except Exception as e:  # noqa: BLE001
        print(f"  ! {table}.{column} — {e}")


async def _add_index(conn, name: str, ddl: str) -> None:
    """
    Create index if missing. Wrapped in try/except so a missing column
    doesn't abort the whole migration.
    """
    try:
        await conn.execute(text(ddl))
        print(f"  + index {name}")
    except Exception as e:  # noqa: BLE001
        print(f"  ! index {name} — {e}")


# ---------------------------------------------------------------------
# migration steps
# ---------------------------------------------------------------------


async def migrate_columns(conn) -> None:
    print("[1/3] columns")

    # users.role
    await _add_column(
        conn,
        "users",
        "role",
        "role VARCHAR(16) NOT NULL DEFAULT 'user'",
    )
    await _add_index(
        conn,
        "ix_users_role",
        'CREATE INDEX IF NOT EXISTS ix_users_role ON "users"(role)',
    )

    # feedback_tickets additions
    await _add_column(
        conn,
        "feedback_tickets",
        "priority",
        "priority VARCHAR(16) NOT NULL DEFAULT 'normal'",
    )
    await _add_index(
        conn,
        "ix_feedback_tickets_priority",
        'CREATE INDEX IF NOT EXISTS ix_feedback_tickets_priority '
        'ON "feedback_tickets"(priority)',
    )

    await _add_column(
        conn,
        "feedback_tickets",
        "assigned_to_user_id",
        "assigned_to_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL",
    )
    await _add_index(
        conn,
        "ix_feedback_tickets_assigned_to_user_id",
        'CREATE INDEX IF NOT EXISTS ix_feedback_tickets_assigned_to_user_id '
        'ON "feedback_tickets"(assigned_to_user_id)',
    )

    await _add_column(
        conn,
        "feedback_tickets",
        "last_replied_by",
        "last_replied_by VARCHAR(16) NULL",
    )

    await _add_column(
        conn,
        "feedback_tickets",
        "first_responded_at",
        "first_responded_at TIMESTAMPTZ NULL",
    )

    await _add_column(
        conn,
        "feedback_tickets",
        "first_response_due_at",
        "first_response_due_at TIMESTAMPTZ NULL",
    )
    await _add_index(
        conn,
        "ix_feedback_tickets_first_response_due_at",
        'CREATE INDEX IF NOT EXISTS ix_feedback_tickets_first_response_due_at '
        'ON "feedback_tickets"(first_response_due_at)',
    )

    await _add_column(
        conn,
        "feedback_tickets",
        "resolution_due_at",
        "resolution_due_at TIMESTAMPTZ NULL",
    )
    await _add_index(
        conn,
        "ix_feedback_tickets_resolution_due_at",
        'CREATE INDEX IF NOT EXISTS ix_feedback_tickets_resolution_due_at '
        'ON "feedback_tickets"(resolution_due_at)',
    )


async def migrate_tables(conn) -> None:
    print("[2/3] tables")

    # ---- ticket_events ----
    if not await _table_exists(conn, "ticket_events"):
        print("  + ticket_events")
        await conn.execute(
            text(
                """
                CREATE TABLE ticket_events (
                    id UUID PRIMARY KEY,
                    ticket_id UUID NOT NULL
                        REFERENCES feedback_tickets(id) ON DELETE CASCADE,
                    actor_user_id UUID NULL
                        REFERENCES users(id) ON DELETE SET NULL,
                    actor_kind VARCHAR(16) NOT NULL,
                    kind VARCHAR(32) NOT NULL,
                    data JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_ticket_events_ticket_id ON ticket_events(ticket_id)"
            )
        )
        await conn.execute(
            text("CREATE INDEX ix_ticket_events_kind ON ticket_events(kind)")
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_ticket_events_created_at ON ticket_events(created_at)"
            )
        )
    else:
        print("  = ticket_events exists")

    # ---- ticket_tags ----
    if not await _table_exists(conn, "ticket_tags"):
        print("  + ticket_tags")
        await conn.execute(
            text(
                """
                CREATE TABLE ticket_tags (
                    id UUID PRIMARY KEY,
                    ticket_id UUID NOT NULL
                        REFERENCES feedback_tickets(id) ON DELETE CASCADE,
                    tag VARCHAR(64) NOT NULL,
                    created_by UUID NULL
                        REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_ticket_tag UNIQUE (ticket_id, tag)
                )
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_ticket_tags_ticket_id ON ticket_tags(ticket_id)"
            )
        )
        await conn.execute(
            text("CREATE INDEX ix_ticket_tags_tag ON ticket_tags(tag)")
        )
    else:
        print("  = ticket_tags exists")

    # ---- canned_responses ----
    if not await _table_exists(conn, "canned_responses"):
        print("  + canned_responses")
        await conn.execute(
            text(
                """
                CREATE TABLE canned_responses (
                    id UUID PRIMARY KEY,
                    title VARCHAR(120) NOT NULL,
                    body TEXT NOT NULL,
                    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_by UUID NULL
                        REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
    else:
        print("  = canned_responses exists")

    # ---- sla_policies ----
    if not await _table_exists(conn, "sla_policies"):
        print("  + sla_policies")
        await conn.execute(
            text(
                """
                CREATE TABLE sla_policies (
                    id UUID PRIMARY KEY,
                    priority VARCHAR(16) NOT NULL UNIQUE,
                    first_response_minutes INTEGER NOT NULL,
                    resolution_minutes INTEGER NOT NULL,
                    updated_by UUID NULL
                        REFERENCES users(id) ON DELETE SET NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_sla_policies_priority ON sla_policies(priority)"
            )
        )
    else:
        print("  = sla_policies exists")

    # ---- webhook_targets ----
    if not await _table_exists(conn, "webhook_targets"):
        print("  + webhook_targets")
        await conn.execute(
            text(
                """
                CREATE TABLE webhook_targets (
                    id UUID PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    url TEXT NOT NULL,
                    secret VARCHAR(256) NULL,
                    events JSONB NOT NULL DEFAULT '["*"]'::jsonb,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    last_status_code INTEGER NULL,
                    last_delivery_at TIMESTAMPTZ NULL,
                    failure_count INTEGER NOT NULL DEFAULT 0,
                    created_by UUID NULL
                        REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
    else:
        print("  = webhook_targets exists")

    # ---- webhook_deliveries ----
    if not await _table_exists(conn, "webhook_deliveries"):
        print("  + webhook_deliveries")
        await conn.execute(
            text(
                """
                CREATE TABLE webhook_deliveries (
                    id UUID PRIMARY KEY,
                    target_id UUID NOT NULL
                        REFERENCES webhook_targets(id) ON DELETE CASCADE,
                    event_kind VARCHAR(32) NOT NULL,
                    ticket_id UUID NULL
                        REFERENCES feedback_tickets(id) ON DELETE SET NULL,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    status_code INTEGER NULL,
                    response_body TEXT NULL,
                    attempt INTEGER NOT NULL DEFAULT 1,
                    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_webhook_deliveries_target_id "
                "ON webhook_deliveries(target_id)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_webhook_deliveries_event_kind "
                "ON webhook_deliveries(event_kind)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_webhook_deliveries_ticket_id "
                "ON webhook_deliveries(ticket_id)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_webhook_deliveries_delivered_at "
                "ON webhook_deliveries(delivered_at)"
            )
        )
    else:
        print("  = webhook_deliveries exists")

    # ---- impersonation_sessions ----
    if not await _table_exists(conn, "impersonation_sessions"):
        print("  + impersonation_sessions")
        await conn.execute(
            text(
                """
                CREATE TABLE impersonation_sessions (
                    id UUID PRIMARY KEY,
                    admin_user_id UUID NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE,
                    target_user_id UUID NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE,
                    reason TEXT NULL,
                    ip VARCHAR(64) NULL,
                    user_agent TEXT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ended_at TIMESTAMPTZ NULL
                )
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_impersonation_sessions_admin_user_id "
                "ON impersonation_sessions(admin_user_id)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_impersonation_sessions_target_user_id "
                "ON impersonation_sessions(target_user_id)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_impersonation_sessions_is_active "
                "ON impersonation_sessions(is_active)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX ix_impersonation_sessions_started_at "
                "ON impersonation_sessions(started_at)"
            )
        )
    else:
        print("  = impersonation_sessions exists")


async def seed_sla(db: AsyncSession) -> None:
    print("[3/3] seed sla_policies")
    from sqlalchemy import select

    from app.db.models import SlaPolicy

    defaults = settings.sla_defaults()

    for priority, (first_min, resolve_min) in defaults.items():
        res = await db.execute(
            select(SlaPolicy).where(SlaPolicy.priority == priority)
        )
        existing = res.scalar_one_or_none()
        if existing is None:
            print(f"  + sla {priority}: {first_min}/{resolve_min}")
            db.add(
                SlaPolicy(
                    priority=priority,
                    first_response_minutes=first_min,
                    resolution_minutes=resolve_min,
                )
            )
        else:
            print(
                f"  = sla {priority} exists "
                f"({existing.first_response_minutes}/"
                f"{existing.resolution_minutes})"
            )

    await db.commit()


# ---------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------


async def main() -> None:
    print("[migrate_admin_tier3] starting")

    async with engine.begin() as conn:
        await migrate_columns(conn)
        await migrate_tables(conn)

    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await seed_sla(db)

    await engine.dispose()
    print("[migrate_admin_tier3] done")


if __name__ == "__main__":
    asyncio.run(main())
