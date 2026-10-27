"""
Add hidden_from_admin_at to feedback_tickets (soft delete).

Idempotent — safe to run twice.
"""
import asyncio
import sys
from pathlib import Path

# Allow imports from apps/api/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text(
            "ALTER TABLE feedback_tickets "
            "ADD COLUMN IF NOT EXISTS hidden_from_admin_at "
            "TIMESTAMPTZ NULL"
        ))
        await db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_feedback_tickets_hidden "
            "ON feedback_tickets (hidden_from_admin_at)"
        ))
        await db.commit()
        print("migration applied: hidden_from_admin_at")


if __name__ == "__main__":
    asyncio.run(main())
