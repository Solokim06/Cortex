"""
One-time migration: add `locale` column to tables that store
LLM-generated content.

Usage (from apps/api/ with the venv active):

    python scripts/migrate_add_locale.py

Idempotent — running it twice is safe.
"""

import asyncio

from sqlalchemy import text

from app.db.session import engine


# Tables that need a `locale` column, in dependency order.
TABLES = [
    "goals",
    "learning_plans",
    "decisions",
    "reflections",
    "self_models",
    "identity_snapshots",
]


async def migrate():
    async with engine.begin() as conn:
        for table in TABLES:
            print(f"[migrate] {table} ... ", end="", flush=True)

            # ADD COLUMN IF NOT EXISTS is idempotent and Postgres-native.
            await conn.execute(
                text(
                    f"""
                    ALTER TABLE {table}
                    ADD COLUMN IF NOT EXISTS locale VARCHAR(5) NOT NULL DEFAULT 'en'
                    """
                )
            )

            # Index for fast filtering by locale.
            await conn.execute(
                text(
                    f"""
                    CREATE INDEX IF NOT EXISTS ix_{table}_locale
                    ON {table} (locale)
                    """
                )
            )

            print("ok")

    print("\n[migrate] done.")


if __name__ == "__main__":
    asyncio.run(migrate())
