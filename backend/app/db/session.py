"""Database engine and the per-request session dependency."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from ..core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set. Add it to backend/.env.")
    return create_engine(
        settings.database_url,
        # Neon (and any cloud Postgres) closes idle connections. Test a pooled
        # connection before using it, and recycle old ones.
        pool_pre_ping=True,
        pool_recycle=300,
        # Neon's pooled host (PgBouncer) does not like server-side prepared statements.
        connect_args={"prepare_threshold": None},
    )


def get_db() -> Iterator[Session]:
    """One database session per request; always closed afterwards."""
    with Session(get_engine(), expire_on_commit=False) as db:
        yield db
