"""
One-time migration: create the user_model table.

Tier 2 #3 -- persistent user profile. One row per user, regenerated
incrementally by an LLM pass over recent messages + captures. The
profile is a JSON struct of six fields, rendered into a system
message and prepended to chat history.

Usage (from apps/api/ with the venv active):

    python scripts/migrate_add_user_model.py

Idempotent -- running it twice is safe.
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
        print("[migrate] user_model table ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_model (
                user_id              UUID PRIMARY KEY
                                     REFERENCES users(id) ON DELETE CASCADE,
                profile              JSONB NOT NULL DEFAULT '{}'::jsonb,
                source_message_count INTEGER NOT NULL DEFAULT 0,
                last_updated_at      TIMESTAMPTZ,
                created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        print("ok")

    print("\n[migrate] done.")


if __name__ == "__main__":
    asyncio.run(migrate())
