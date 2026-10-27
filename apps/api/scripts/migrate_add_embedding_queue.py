"""
Migration: embedding queue.

Run from apps/api/:

    python scripts/migrate_add_embedding_queue.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import engine


SQL = """
CREATE TABLE IF NOT EXISTS embedding_queue (
    node_id     UUID PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    queued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_embedding_queue_user_id
    ON embedding_queue (user_id);

CREATE INDEX IF NOT EXISTS ix_embedding_queue_queued_at
    ON embedding_queue (queued_at);
"""


async def main() -> None:
    async with engine.begin() as conn:
        for stmt in SQL.split(";"):
            s = stmt.strip()
            if s:
                await conn.execute(text(s))
    print("OK: embedding_queue ready")


if __name__ == "__main__":
    asyncio.run(main())
