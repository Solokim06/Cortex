"""
Add ai_processing boolean to user_preferences.

Defaults to TRUE so existing users keep their current behavior — only
new consent-prompted users can turn it off, matching the GDPR
"legitimate interest" pattern.

Run:
    python scripts/migrate_add_ai_processing_pref.py
"""

import asyncio

from sqlalchemy import text

from app.db.session import engine


async def main():
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE user_preferences
            ADD COLUMN IF NOT EXISTS ai_processing BOOLEAN NOT NULL DEFAULT TRUE
        """))
        print("user_preferences.ai_processing added (default TRUE)")


if __name__ == "__main__":
    asyncio.run(main())
