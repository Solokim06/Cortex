"""
Add user_preferences table. Idempotent.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal


async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                voice VARCHAR(32) NULL,
                data_contribution_optin BOOLEAN NOT NULL DEFAULT FALSE,
                data_contribution_changed_at TIMESTAMPTZ NULL,
                data_contribution_changed_ip VARCHAR(64) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await db.commit()
        print("migration applied: user_preferences")


if __name__ == "__main__":
    asyncio.run(main())
