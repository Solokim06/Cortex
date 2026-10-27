"""
Add `edges` column to chat_messages.

Session 7: the GraphStrip needs the walked subgraph's edges persisted
alongside each assistant reply, or the graph vanishes on refetch.

Three-step migration because a single ALTER TABLE ADD COLUMN NOT NULL
DEFAULT against existing rows exceeds Supabase's statement timeout on
the pooler:

  1. ADD COLUMN edges JSON  (nullable, no default — instant)
  2. UPDATE ... SET edges = '[]'  (backfill in one pass)
  3. ALTER COLUMN edges SET NOT NULL  (metadata-only once all rows have values)

Run from apps/api/:

    python scripts/migrate_add_message_edges.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def run():
    async with AsyncSessionLocal() as db:
        exists = (await db.execute(text("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'chat_messages'
              AND column_name = 'edges'
        """))).scalar()

        if exists:
            print("chat_messages.edges already exists — nothing to do.")
            return

        print("step 1/3: adding nullable column ...")
        await db.execute(text(
            "ALTER TABLE chat_messages ADD COLUMN edges JSON"
        ))
        await db.commit()

        print("step 2/3: backfilling existing rows ...")
        result = await db.execute(text(
            "UPDATE chat_messages SET edges = '[]'::json WHERE edges IS NULL"
        ))
        await db.commit()
        print(f"         backfilled {result.rowcount} rows")

        print("step 3/3: adding NOT NULL constraint ...")
        await db.execute(text(
            "ALTER TABLE chat_messages ALTER COLUMN edges SET NOT NULL"
        ))
        await db.commit()

        print("done.")


if __name__ == "__main__":
    asyncio.run(run())
