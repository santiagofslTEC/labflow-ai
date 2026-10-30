from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager
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

SessionFactory = Callable[[], AbstractContextManager[Session]]


def get_session_factory() -> SessionFactory:
    """For work that outlives its request (a voice turn keeps running and is cached even if
    ElevenLabs drops the call, spec 0007 AC-14): it opens and closes its own session."""
    return lambda: Session(get_engine())


SessionFactoryDep = Annotated[SessionFactory, Depends(get_session_factory)]
