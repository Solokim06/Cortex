"""
One-time migration: create the message_embeddings table.

Tier 2 cross-conversation recall — we embed every chat message (user
and assistant) so future queries can search past conversations by
meaning, not just by the current conversation's recent turns.

Separate table from `embeddings` because that one is keyed on
node_id (captures); this one is keyed on message_id (chat).

Usage (from apps/api/ with the venv active):

    python scripts/migrate_add_message_embeddings.py

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
        print("[migrate] message_embeddings table ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS message_embeddings (
                id              UUID PRIMARY KEY,
                message_id      UUID NOT NULL UNIQUE
                                REFERENCES chat_messages(id) ON DELETE CASCADE,
                conversation_id UUID NOT NULL
                                REFERENCES chat_conversations(id) ON DELETE CASCADE,
                user_id         UUID NOT NULL
                                REFERENCES users(id) ON DELETE CASCADE,
                role            TEXT NOT NULL,
                model           TEXT NOT NULL,
                dim             INTEGER NOT NULL,
                content_hash    TEXT NOT NULL,
                embedding       vector(768),
                created_at      TIMESTAMPTZ DEFAULT now()
            )
        """))
        print("ok")

        print("[migrate] index on user_id ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_message_embeddings_user
            ON message_embeddings (user_id)
        """))
        print("ok")

        print("[migrate] index on conversation_id ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_message_embeddings_conv
            ON message_embeddings (conversation_id)
        """))
        print("ok")

        print("[migrate] index on message_id ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_message_embeddings_message
            ON message_embeddings (message_id)
        """))
        print("ok")

    print("\n[migrate] done.")


if __name__ == "__main__":
    asyncio.run(migrate())
