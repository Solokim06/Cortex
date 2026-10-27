"""
One-time backfill: rename conversations still titled "New chat"
using the first user message in each conversation.

Usage (from apps/api/ with the venv active):

    python scripts/backfill_conversation_titles.py

Idempotent — running it twice is safe.
"""

import asyncio
import sys
from pathlib import Path

# Match scripts/dev.py: make `app` importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.db.session import engine  # noqa: E402


async def backfill():
    async with engine.begin() as conn:
        rows = await conn.execute(
            text(
                """
                SELECT c.id AS conversation_id,
                       (
                         SELECT m.content
                         FROM chat_messages m
                         WHERE m.conversation_id = c.id
                           AND m.role = 'user'
                         ORDER BY m.created_at ASC
                         LIMIT 1
                       ) AS first_user_message
                FROM chat_conversations c
                WHERE c.title = 'New chat'
                  AND c.message_count > 0
                ORDER BY c.created_at ASC
                """
            )
        )
        candidates = rows.fetchall()
        print(f"[backfill] {len(candidates)} candidate(s)")

        for row in candidates:
            conversation_id = row.conversation_id
            message = (row.first_user_message or "").strip()
            if not message:
                continue

            cleaned = " ".join(message.split())
            title = cleaned if len(cleaned) <= 60 else cleaned[:57] + "\u2026"

            await conn.execute(
                text(
                    """
                    UPDATE chat_conversations
                    SET title = :title
                    WHERE id = :conversation_id
                      AND title = 'New chat'
                    """
                ),
                {"title": title, "conversation_id": conversation_id},
            )
            print(f"[backfill] {conversation_id} -> {title!r}")

    print("\n[backfill] done.")


if __name__ == "__main__":
    asyncio.run(backfill())
