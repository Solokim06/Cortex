"""
Wave B+C migration — idempotent.

Adds:
  - feedback_tickets.search_vector  (tsvector, auto-populated by trigger)
  - GIN index on feedback_tickets.search_vector
  - Table: admin_notification_prefs
  - Backfill: populates search_vector for all existing tickets

Safe to run multiple times. Uses IF NOT EXISTS + DROP TRIGGER IF EXISTS.

Note: search_vector weights subject (A) > description (B), and the
trigger runs on INSERT/UPDATE of those two columns. Replies are matched
separately at query time (joins through feedback_replies).
"""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

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
        "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=:i"
    )
    res = await conn.execute(q, {"i": index})
    return res.first() is not None


# ---------------------------------------------------------------------
# steps
# ---------------------------------------------------------------------


async def add_search_vector(conn) -> None:
    print("[1/4] feedback_tickets.search_vector")

    # 1. Add column if missing
    if not await _column_exists(conn, "feedback_tickets", "search_vector"):
        print("  + column search_vector")
        await conn.execute(
            text(
                "ALTER TABLE feedback_tickets "
                "ADD COLUMN search_vector tsvector"
            )
        )
    else:
        print("  = column search_vector exists")

    # 2. Create the trigger function (idempotent replace)
    print("  + trigger function feedback_tickets_search_update")
    await conn.execute(
        text(
            """
            CREATE OR REPLACE FUNCTION feedback_tickets_search_update()
            RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            """
        )
    )

    # 3. Attach the trigger (drop first to avoid duplicates)
    await conn.execute(
        text(
            "DROP TRIGGER IF EXISTS trg_feedback_tickets_search "
            "ON feedback_tickets"
        )
    )
    await conn.execute(
        text(
            """
            CREATE TRIGGER trg_feedback_tickets_search
            BEFORE INSERT OR UPDATE OF subject, description
            ON feedback_tickets
            FOR EACH ROW
            EXECUTE FUNCTION feedback_tickets_search_update();
            """
        )
    )
    print("  + trigger trg_feedback_tickets_search")

    # 4. GIN index
    if not await _index_exists(conn, "ix_feedback_tickets_search_vector"):
        print("  + index ix_feedback_tickets_search_vector")
        await conn.execute(
            text(
                "CREATE INDEX ix_feedback_tickets_search_vector "
                "ON feedback_tickets USING GIN(search_vector)"
            )
        )
    else:
        print("  = index ix_feedback_tickets_search_vector exists")

    # 5. Backfill existing rows
    print("  ~ backfilling search_vector for existing rows")
    await conn.execute(
        text(
            """
            UPDATE feedback_tickets
            SET search_vector =
                setweight(to_tsvector('english', COALESCE(subject, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(description, '')), 'B')
            WHERE search_vector IS NULL
            """
        )
    )


async def add_notification_prefs(conn) -> None:
    print("[2/4] admin_notification_prefs table")

    if await _table_exists(conn, "admin_notification_prefs"):
        print("  = table exists")
        return

    print("  + table admin_notification_prefs")
    await conn.execute(
        text(
            """
            CREATE TABLE admin_notification_prefs (
                user_id UUID PRIMARY KEY
                    REFERENCES users(id) ON DELETE CASCADE,
                email_on_new_ticket BOOLEAN NOT NULL DEFAULT TRUE,
                email_on_assignment BOOLEAN NOT NULL DEFAULT TRUE,
                email_on_user_reply BOOLEAN NOT NULL DEFAULT TRUE,
                email_on_sla_breach BOOLEAN NOT NULL DEFAULT TRUE,
                email_digest_daily BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )


async def seed_prefs_for_admins(conn) -> None:
    print("[3/4] seeding prefs for existing admins/agents")

    result = await conn.execute(
        text(
            """
            INSERT INTO admin_notification_prefs (user_id)
            SELECT id FROM users WHERE role IN ('admin', 'agent')
            ON CONFLICT (user_id) DO NOTHING
            """
        )
    )
    print(f"  ~ inserted {result.rowcount} preference row(s)")


async def summary(conn) -> None:
    print("[4/4] verify")

    r = await conn.execute(
        text(
            "SELECT COUNT(*) FROM feedback_tickets WHERE search_vector IS NOT NULL"
        )
    )
    indexed = r.scalar_one()
    r2 = await conn.execute(text("SELECT COUNT(*) FROM feedback_tickets"))
    total = r2.scalar_one()
    print(f"  search_vector: {indexed}/{total} tickets indexed")

    r3 = await conn.execute(
        text("SELECT COUNT(*) FROM admin_notification_prefs")
    )
    print(f"  admin_notification_prefs: {r3.scalar_one()} row(s)")


# ---------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------


async def main() -> None:
    print("[migrate_wave_bc] starting")

    async with engine.begin() as conn:
        await add_search_vector(conn)
        await add_notification_prefs(conn)
        await seed_prefs_for_admins(conn)
        await summary(conn)

    await engine.dispose()
    print("[migrate_wave_bc] done")


if __name__ == "__main__":
    asyncio.run(main())
