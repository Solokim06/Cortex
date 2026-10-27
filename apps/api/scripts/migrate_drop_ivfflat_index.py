"""
Drop the ivfflat index on embeddings.embedding.

Why: it was created with lists=100 (pgvector's default for ~1M rows)
against a table with only ~50 rows. At query time ivfflat.probes=1
meant the planner probed a single list — usually an empty one — and
returned zero rows without error.

That silent zero-row result was the root cause of "Where have I
contradicted myself?" returning no seeds (see Session 6 eval).

At our current table size, a full sequential scan with cosine distance
is both faster and guaranteed correct. Recreate the index when
embeddings.rowcount approaches 10,000, with lists = rowcount / 1000.

Run from apps/api/:

    python scripts/migrate_drop_ivfflat_index.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def run():
    async with AsyncSessionLocal() as db:
        # Confirm the index exists before dropping.
        exists = (await db.execute(text("""
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'embeddings'
              AND indexname = 'idx_embeddings_vector'
        """))).scalar()

        if not exists:
            print("idx_embeddings_vector does not exist — nothing to do.")
            return

        # Count rows so we can log the current size.
        rowcount = (await db.execute(
            text("SELECT count(*) FROM embeddings")
        )).scalar()

        print(f"embeddings rows: {rowcount}")
        print("dropping idx_embeddings_vector ...")
        await db.execute(text("DROP INDEX idx_embeddings_vector"))
        await db.commit()
        print("done.")
        print()
        print("Recreate this index when embeddings.rowcount > ~10,000 with:")
        print("  CREATE INDEX idx_embeddings_vector ON embeddings")
        print("    USING ivfflat (embedding vector_cosine_ops)")
        print("    WITH (lists = <rowcount / 1000>);")
        print("and set ivfflat.probes >= sqrt(lists) at query time.")


if __name__ == "__main__":
    asyncio.run(run())
