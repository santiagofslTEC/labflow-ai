from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine
from sqlmodel import Session, create_engine

from app.core.settings import get_settings


@lru_cache  # the one allowed process singleton: a connection pool, not app state
def get_engine() -> Engine:
    """One pool per process, sized for the Supavisor session pooler (spec 0001)."""
    return create_engine(
        get_settings().database_url,
        pool_size=5,
        max_overflow=0,
        pool_pre_ping=True,
        pool_recycle=300,
    )


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
