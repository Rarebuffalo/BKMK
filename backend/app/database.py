from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine() -> Engine:
    # One long-running process with a small pool: Neon's direct endpoint is fine and
    # avoids PgBouncer transaction-mode caveats. Recycling below Neon's 5-minute
    # scale-to-zero means idle connections never outlive a suspended compute, and
    # pre-ping replaces any that dropped anyway.
    return create_engine(
        get_settings().database_url,
        pool_size=5,
        max_overflow=5,
        pool_recycle=280,
        pool_pre_ping=True,
        pool_timeout=10,
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed."""
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()
