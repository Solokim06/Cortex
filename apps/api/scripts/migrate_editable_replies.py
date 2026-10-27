"""
Add edited_at to feedback_replies. Idempotent.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text(
            "ALTER TABLE feedback_replies "
            "ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL"
        ))
        await db.commit()
        print("migration applied: feedback_replies.edited_at")


if __name__ == "__main__":
    asyncio.run(main())
