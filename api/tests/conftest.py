"""Shared fixtures. Tests read `api/.env` like the app does, so run pytest from `api/`.

Tests that touch the database run against DATABASE_URL inside one outer transaction that is
rolled back at the end, so nothing they write survives. Repository commits become savepoints.
They are skipped when the database cannot be reached.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlmodel import Session

from app.core.access import SESSION_COOKIE, sign_session
from app.core.db import get_engine, get_session
from app.core.settings import get_settings
from app.main import app


@pytest.fixture
def holder() -> str:
    return next(iter(get_settings().access_codes))


@pytest.fixture
def client() -> Iterator[TestClient]:
    """No session cookie: every gated route answers 401."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session() -> Iterator[Session]:
    try:
        connection = get_engine().connect()
    except OperationalError:
        pytest.skip("database not reachable")
    outer = connection.begin()
    db = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield db
    finally:
        db.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def authed(session: Session, holder: str) -> Iterator[TestClient]:
    """Signed in as `holder`, with every request sharing the rolled back `session`."""
    app.dependency_overrides[get_session] = lambda: session
    try:
        with TestClient(app) as test_client:
            test_client.cookies.set(
                SESSION_COOKIE, sign_session(get_settings().session_secret, holder)
            )
            yield test_client
    finally:
        app.dependency_overrides.clear()
