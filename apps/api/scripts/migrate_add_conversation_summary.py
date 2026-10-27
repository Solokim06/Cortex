"""
One-time migration: add rolling-summary columns to chat_conversations.

Tier 2 long-term memory — when a conversation grows past a token
threshold, the oldest turns are folded into a running `summary`, and
`summary_through_id` records how far we've summarized.

Columns added:
    summary             TEXT        NULL   — rolling summary text
    summary_through_id  UUID        NULL   — last message id included in summary
    summary_updated_at  TIMESTAMPTZ NULL   — last regeneration time

Usage (from apps/api/ with the venv active):

    python scripts/migrate_add_conversation_summary.py

Idempotent — running it twice is safe.
"""

import asyncio
import sys
from pathlib import Path

# Match scripts/dev.py: make `app` importable when run from scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.db.session import engine  # noqa: E402


async def migrate():
    async with engine.begin() as conn:
        print("[migrate] chat_conversations.summary ... ", end="", flush=True)
        await conn.execute(
            text(
                """
                ALTER TABLE chat_conversations
                ADD COLUMN IF NOT EXISTS summary TEXT
                """
            )
        )
        print("ok")

        print("[migrate] chat_conversations.summary_through_id ... ", end="", flush=True)
        await conn.execute(
            text(
                """
                ALTER TABLE chat_conversations
                ADD COLUMN IF NOT EXISTS summary_through_id UUID
                """
            )
        )
        print("ok")

        print("[migrate] chat_conversations.summary_updated_at ... ", end="", flush=True)
        await conn.execute(
            text(
                """
                ALTER TABLE chat_conversations
                ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ
                """
            )
        )
        print("ok")

    print("\n[migrate] done.")


if __name__ == "__main__":
    asyncio.run(migrate())
