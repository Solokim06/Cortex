from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User

DEV_USER_EMAIL = "dev@cortex.local"


async def get_or_create_dev_user(db: AsyncSession) -> User:
    """Return the dev user, creating it if it doesn't exist."""
    result = await db.execute(select(User).where(User.email == DEV_USER_EMAIL))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=DEV_USER_EMAIL, name="Dev User")
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user
