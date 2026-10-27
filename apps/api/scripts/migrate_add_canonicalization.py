"""
Migration: concept canonicalization.

Adds:
  - nodes.canonical_concept_id (nullable FK to nodes.id)
  - concept_aliases table

Run from apps/api/:

    python scripts/migrate_add_canonicalization.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import engine


SQL = """
ALTER TABLE nodes
    ADD COLUMN IF NOT EXISTS canonical_concept_id UUID
    REFERENCES nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_nodes_canonical_concept_id
    ON nodes (canonical_concept_id);

CREATE TABLE IF NOT EXISTS concept_aliases (
    id                 UUID PRIMARY KEY,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alias_node_id      UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    canonical_node_id  UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    match_strategy     VARCHAR(32) NOT NULL,
    similarity         FLOAT NOT NULL DEFAULT 0.0,
    note               VARCHAR(255) NOT NULL DEFAULT '',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_concept_aliases_user_id
    ON concept_aliases (user_id);

CREATE INDEX IF NOT EXISTS ix_concept_aliases_alias_node_id
    ON concept_aliases (alias_node_id);

CREATE INDEX IF NOT EXISTS ix_concept_aliases_canonical_node_id
    ON concept_aliases (canonical_node_id);
"""


async def main() -> None:
    async with engine.begin() as conn:
        for stmt in SQL.split(";"):
            s = stmt.strip()
            if s:
                await conn.execute(text(s))
    print("OK: canonicalization schema ready")


if __name__ == "__main__":
    asyncio.run(main())
