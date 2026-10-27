"""
One-time migration: agentic actions foundation.

Phase 4.1 -- adds:

  agent_actions table       -- audit log for every agent proposal/apply/undo
  user_preferences          -- adds agent_auto_apply JSONB column for
                               per-user override of per-kind approval defaults

Usage (from apps/api/ with the venv active):

    python scripts/migrate_add_agent_actions.py

Idempotent -- running it twice is safe.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.db.session import engine  # noqa: E402


async def migrate():
    async with engine.begin() as conn:
        print("[migrate] agent_actions table ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_actions (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
                action_kind VARCHAR(32) NOT NULL,
                instruction TEXT,
                proposal JSONB NOT NULL,
                status VARCHAR(16) NOT NULL,
                result JSONB,
                snapshot JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                applied_at TIMESTAMPTZ,
                undone_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ
            )
        """))
        print("ok")

        print("[migrate] agent_actions.user_id index ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_agent_actions_user_status
            ON agent_actions (user_id, status)
        """))
        print("ok")

        print("[migrate] agent_actions.created_at index ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_agent_actions_created
            ON agent_actions (created_at DESC)
        """))
        print("ok")

        print("[migrate] user_preferences.agent_auto_apply ... ", end="", flush=True)
        await conn.execute(text("""
            ALTER TABLE user_preferences
            ADD COLUMN IF NOT EXISTS agent_auto_apply JSONB
            NOT NULL DEFAULT '{}'::jsonb
        """))
        print("ok")

    print("\n[migrate] done.")


if __name__ == "__main__":
    asyncio.run(migrate())
