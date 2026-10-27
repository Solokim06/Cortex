"""
One-time migration: add graph-health columns.

Tier 8 -- proactive graph health. Three additions:

  concept_aliases.status      -- accepted | pending | rejected
                                 Backfilled to 'accepted' for existing rows
                                 (they were auto-applied historically).

  nodes.stale_since           -- set by the stale-detection worker when a
                                 concept has been dormant past the
                                 threshold. NULL = not stale.

  nodes.stale_dismissed_until -- user can mute the stale flag until a date.
                                 Worker skips nodes whose dismissed_until
                                 is in the future.

Usage (from apps/api/ with the venv active):

    python scripts/migrate_add_graph_health.py

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
        print("[migrate] concept_aliases.status ... ", end="", flush=True)
        await conn.execute(text("""
            ALTER TABLE concept_aliases
            ADD COLUMN IF NOT EXISTS status VARCHAR(16)
            NOT NULL DEFAULT 'accepted'
        """))
        print("ok")

        print("[migrate] nodes.stale_since ... ", end="", flush=True)
        await conn.execute(text("""
            ALTER TABLE nodes
            ADD COLUMN IF NOT EXISTS stale_since TIMESTAMPTZ
        """))
        print("ok")

        print("[migrate] nodes.stale_dismissed_until ... ", end="", flush=True)
        await conn.execute(text("""
            ALTER TABLE nodes
            ADD COLUMN IF NOT EXISTS stale_dismissed_until TIMESTAMPTZ
        """))
        print("ok")

        print("[migrate] index on concept_aliases.status ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_concept_aliases_status
            ON concept_aliases (status)
        """))
        print("ok")

        print("[migrate] index on nodes.stale_since ... ", end="", flush=True)
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_nodes_stale_since
            ON nodes (stale_since)
            WHERE stale_since IS NOT NULL
        """))
        print("ok")

    print("\n[migrate] done.")


if __name__ == "__main__":
    asyncio.run(migrate())
