"""
SQLAlchemy async engine + session.

Using Supabase's Session Mode pooler (port 5432) instead of the
Transaction Mode pooler (port 6543). Session mode gives each client a
dedicated backend connection, so asyncpg's prepared statements work
correctly — no more DuplicatePreparedStatementError.
"""

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from pgvector.asyncpg import register_vector

from app.config.settings import settings


engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=False,
    pool_recycle=1800,
    pool_timeout=30,
)


@event.listens_for(engine.sync_engine, "connect")
def _register_vector_codec(dbapi_connection, _connection_record):
    """
    Register pgvector codec on every new asyncpg connection.

    SQLAlchemy 的 asyncpg 方言会过滤 connect_args，`init` 不被识别。
    官方推荐的方案是用 `connect` 事件 + `run_async`，它在连接
    交给连接池之前 await 完成，不跟第一条查询竞争。
    """
    dbapi_connection.run_async(register_vector)


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
