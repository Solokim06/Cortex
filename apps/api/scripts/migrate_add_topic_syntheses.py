"""
Migration: create topic_syntheses table.

Run from apps/api/:

    python scripts/migrate_add_topic_syntheses.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import engine


SQL = """
CREATE TABLE IF NOT EXISTS topic_syntheses (
    id                UUID PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id        UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_node_ids   JSON NOT NULL DEFAULT '[]'::json,
    content_hash      VARCHAR NOT NULL,
    headline          TEXT NOT NULL DEFAULT '',
    payload           JSON NOT NULL DEFAULT '{}'::json,
    model             VARCHAR NOT NULL DEFAULT '',
    locale            VARCHAR NOT NULL DEFAULT 'en',
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    stale             BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_topic_synthesis_user_concept UNIQUE (user_id, concept_id)
);

CREATE INDEX IF NOT EXISTS ix_topic_syntheses_user_id
    ON topic_syntheses (user_id);

CREATE INDEX IF NOT EXISTS ix_topic_syntheses_concept_id
    ON topic_syntheses (concept_id);
"""


async def main() -> None:
    async with engine.begin() as conn:
        for stmt in SQL.split(";"):
            s = stmt.strip()
            if s:
                await conn.execute(text(s))
    print("OK: topic_syntheses table ready")


if __name__ == "__main__":
    asyncio.run(main())
