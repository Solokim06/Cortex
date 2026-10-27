"""
Email system migration — idempotent.

Creates:
  - email_deliveries     (one row per outbound email attempt)
  - email_suppressions   (addresses that must never receive mail)

Safe to run multiple times. Uses IF NOT EXISTS everywhere.

Run from apps/api:
    python scripts/migrate_email_system.py
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


async def create_email_deliveries(conn) -> None:
    print("[1/2] email_deliveries")

    if await _table_exists(conn, "email_deliveries"):
        print("  = table exists")
        return

    print("  + creating table")
    await conn.execute(
        text(
            """
            CREATE TABLE email_deliveries (
                id UUID PRIMARY KEY,
                to_email VARCHAR(320) NOT NULL,
                template VARCHAR(64) NOT NULL,
                subject VARCHAR(300) NOT NULL,
                ticket_id UUID NULL
                    REFERENCES feedback_tickets(id) ON DELETE SET NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'queued',
                provider VARCHAR(16) NOT NULL DEFAULT 'console',
                message_id VARCHAR(128) NULL,
                error TEXT NULL,
                attempt INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                sent_at TIMESTAMPTZ NULL
            )
            """
        )
    )

    # Indexes
    for idx_name, idx_sql in [
        (
            "ix_email_deliveries_to_email",
            "CREATE INDEX ix_email_deliveries_to_email "
            "ON email_deliveries(to_email)",
        ),
        (
            "ix_email_deliveries_template",
            "CREATE INDEX ix_email_deliveries_template "
            "ON email_deliveries(template)",
        ),
        (
            "ix_email_deliveries_status",
            "CREATE INDEX ix_email_deliveries_status "
            "ON email_deliveries(status)",
        ),
        (
            "ix_email_deliveries_ticket_id",
            "CREATE INDEX ix_email_deliveries_ticket_id "
            "ON email_deliveries(ticket_id)",
        ),
        (
            "ix_email_deliveries_created_at",
            "CREATE INDEX ix_email_deliveries_created_at "
            "ON email_deliveries(created_at)",
        ),
    ]:
        if not await _index_exists(conn, idx_name):
            print(f"  + index {idx_name}")
            await conn.execute(text(idx_sql))
        else:
            print(f"  = index {idx_name} exists")


async def create_email_suppressions(conn) -> None:
    print("[2/2] email_suppressions")

    if await _table_exists(conn, "email_suppressions"):
        print("  = table exists")
        return

    print("  + creating table")
    await conn.execute(
        text(
            """
            CREATE TABLE email_suppressions (
                email VARCHAR(320) PRIMARY KEY,
                reason VARCHAR(64) NOT NULL DEFAULT 'manual',
                note TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )


# ---------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------


async def main() -> None:
    print("[migrate_email_system] starting")

    async with engine.begin() as conn:
        await create_email_deliveries(conn)
        await create_email_suppressions(conn)

    await engine.dispose()
    print("[migrate_email_system] done")


if __name__ == "__main__":
    asyncio.run(main())
