"""
One-time migration: create feedback_tickets and feedback_replies tables.

Usage (from apps/api/ with the venv active):

    python -m scripts.migrate_add_feedback

or:

    python scripts/migrate_add_feedback.py

Idempotent — running it twice is safe.
"""

import sys
from pathlib import Path

# Allow running as `python scripts/migrate_add_feedback.py` from apps/api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from sqlalchemy import text

from app.db.session import engine


async def migrate():
    async with engine.begin() as conn:
        print("[migrate] feedback_tickets ... ", end="", flush=True)
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS feedback_tickets (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    category VARCHAR(32) NOT NULL,
                    subject VARCHAR(200) NOT NULL,
                    description TEXT NOT NULL,
                    context JSONB NOT NULL DEFAULT '{}'::jsonb,
                    attachment_url TEXT,
                    status VARCHAR(32) NOT NULL DEFAULT 'open',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    resolved_at TIMESTAMPTZ
                )
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_feedback_tickets_user_id "
                "ON feedback_tickets (user_id)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_feedback_tickets_category "
                "ON feedback_tickets (category)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_feedback_tickets_status "
                "ON feedback_tickets (status)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_feedback_tickets_created_at "
                "ON feedback_tickets (created_at)"
            )
        )
        print("ok")

        print("[migrate] feedback_replies ... ", end="", flush=True)
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS feedback_replies (
                    id UUID PRIMARY KEY,
                    ticket_id UUID NOT NULL REFERENCES feedback_tickets(id) ON DELETE CASCADE,
                    author VARCHAR(16) NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_feedback_replies_ticket_id "
                "ON feedback_replies (ticket_id)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_feedback_replies_created_at "
                "ON feedback_replies (created_at)"
            )
        )
        print("ok")

    print("\n[migrate] done.")


if __name__ == "__main__":
    asyncio.run(migrate())
