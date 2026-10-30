"""Accounts and ownership through the API (spec 0014, AC-5, AC-6, AC-9, AC-10). Tokens are
minted with a local key; the database is real and rolled back after each test."""

from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.access import SESSION_COOKIE, sign_session
from app.core.db import get_session
from app.core.settings import get_settings
from app.main import app
from app.models import Experiment, Proposal
from app.repositories import proposals
from app.repositories.space import assign_shared
from tests.accounts import SUPABASE_URL, key_for, mint
from tests.factories import make_notebook

ANA, BETO = uuid4(), uuid4()


@pytest.fixture
def api(session: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Accounts on, every request sharing the rolled back `session`, no credentials yet."""
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    get_settings.cache_clear()
    app.dependency_overrides[get_session] = lambda: session
    try:
        with TestClient(app) as test_client:
            app.state.supabase_keys = key_for
            yield test_client
    finally:
        app.dependency_overrides.clear()
        monkeypatch.delenv("SUPABASE_URL")
        get_settings.cache_clear()


def as_account(client: TestClient, user: UUID, email: str) -> TestClient:
    client.cookies.clear()
    client.headers["authorization"] = f"Bearer {mint(user, email)}"
    return client


def as_code(client: TestClient) -> TestClient:
    client.headers.pop("authorization", None)
    holder = next(iter(get_settings().access_codes))
    client.cookies.set(SESSION_COOKIE, sign_session(get_settings().session_secret, holder))
    return client


def new_notebook(client: TestClient, title: str) -> int:
    body = {"title": title, "variables": [{"name": "Temperatura", "unit": "°C"}]}
    created = client.post("/api/experiments", json=body)
    assert created.status_code == 201, created.json()
    return int(created.json()["id"])


def test_an_account_owns_what_it_makes_and_sees_only_that(
    api: TestClient, session: Session
) -> None:
    mine = new_notebook(as_account(api, ANA, "ana@example.com"), "De Ana")
    row = session.get(Experiment, mine)
    assert row is not None and (row.owner_id, row.created_by) == (ANA, "ana@example.com")
    shared = make_notebook(session, "Compartido").experiment_id
    titles = [n["title"] for n in api.get("/api/experiments").json()]
    assert "De Ana" in titles and "Compartido" not in titles

    as_account(api, BETO, "beto@example.com")
    assert "De Ana" not in [n["title"] for n in api.get("/api/experiments").json()]
    as_code(api)
    titles = [n["title"] for n in api.get("/api/experiments").json()]
    assert "Compartido" in titles and "De Ana" not in titles
    assert api.get(f"/api/experiments/{shared}").status_code == 200


@pytest.mark.parametrize("who", ["other account", "code"])
def test_another_space_is_404_on_every_route(api: TestClient, session: Session, who: str) -> None:
    nb = make_notebook(session, "De Ana", owner=ANA)
    card = proposals.start_proposal(session, nb.experiment_id, 3)
    assert isinstance(card, Proposal) and card.id is not None
    card_id = card.id
    if who == "code":
        as_code(api)
    else:
        as_account(api, BETO, "beto@example.com")
    e = nb.experiment_id
    calls = [
        ("GET", f"/api/experiments/{e}", None, "experiment_not_found"),
        ("GET", f"/api/experiments/{e}/trials", None, "experiment_not_found"),
        ("GET", f"/api/experiments/{e}/results", None, "experiment_not_found"),
        ("GET", f"/api/experiments/{e}/proposal", None, "experiment_not_found"),
        ("POST", f"/api/experiments/{e}/utterances", {"text": "ensayo 1"}, "experiment_not_found"),
        ("POST", f"/api/experiments/{e}/variables", {"name": "pH"}, "experiment_not_found"),
        (
            "POST",
            f"/api/experiments/{e}/variables/delete",
            {"variable_ids": [nb.temp]},
            "experiment_not_found",
        ),
        ("PUT", f"/api/variables/{nb.temp}", {"name": "T"}, "variable_not_found"),
        ("PUT", f"/api/proposals/{card_id}/values/{nb.temp}", {"value": 40}, "proposal_not_found"),
        ("POST", f"/api/proposals/{card_id}/values/{nb.temp}/check", None, "proposal_not_found"),
        (
            "POST",
            f"/api/proposals/{card_id}/trial",
            {"kind": "new", "trial_number": 4},
            "proposal_not_found",
        ),
        ("POST", f"/api/proposals/{card_id}/confirm", None, "proposal_not_found"),
        ("POST", f"/api/proposals/{card_id}/undo", None, "proposal_not_found"),
        ("POST", f"/api/proposals/{card_id}/discard", None, "proposal_not_found"),
        ("POST", "/api/voice/session", {"experiment_id": e}, "experiment_not_found"),
    ]
    for method, path, body, code in calls:
        answer = api.request(method, path, json=body)
        assert (answer.status_code, answer.json()["code"]) == (404, code), (method, path)
    as_account(api, ANA, "ana@example.com")
    assert api.get(f"/api/experiments/{e}").status_code == 200


def test_a_shared_notebook_is_404_for_an_account(api: TestClient, session: Session) -> None:
    shared = make_notebook(session, "Compartido").experiment_id
    as_account(api, ANA, "ana@example.com")
    assert api.get(f"/api/experiments/{shared}").status_code == 404


def test_a_bad_token_is_401_even_with_a_code_cookie(api: TestClient) -> None:
    as_code(api)
    api.headers["authorization"] = f"Bearer {mint(signed_by_other=True)}"
    answer = api.get("/api/experiments")
    assert (answer.status_code, answer.json()["code"]) == (401, "unauthorized")
    assert answer.json()["message"] == "Tu sesión venció. Entra de nuevo."


def test_who_am_i_and_the_ways_in(api: TestClient) -> None:
    assert api.get("/api/access/options").json() == {"codes": True, "accounts": True}
    token = mint(
        ANA,
        "ana@example.com",
        app_metadata={"provider": "google"},
        user_metadata={"full_name": "Ana Ruiz"},
    )
    api.headers["authorization"] = f"Bearer {token}"
    assert api.get("/api/access").json() == {
        "holder": "ana@example.com",
        "kind": "account",
        "name": "Ana Ruiz",
        "email": "ana@example.com",
        "provider": "google",
    }


def test_without_supabase_a_bearer_is_ignored_and_codes_work(authed: TestClient) -> None:
    """AC-10: accounts off (no SUPABASE_URL), the code cookie decides."""
    authed.headers["authorization"] = f"Bearer {mint()}"
    assert authed.get("/api/experiments").status_code == 200
    assert authed.get("/api/access/options").json() == {"codes": True, "accounts": False}


def owner_of_notebook(session: Session, experiment_id: int) -> UUID | None:
    row = session.get(Experiment, experiment_id)
    assert row is not None
    return row.owner_id


def test_the_shared_notebooks_go_to_one_account(session: Session) -> None:
    """AC-9: the assign script's work, counted first, then done."""
    shared = [make_notebook(session, f"Compartido {i}").experiment_id for i in range(2)]
    mine = make_notebook(session, "De Beto", owner=BETO).experiment_id
    assert assign_shared(session, ANA, dry_run=True) >= 2
    assert all(owner_of_notebook(session, e) is None for e in shared)
    moved = assign_shared(session, ANA, dry_run=False)
    assert moved >= 2
    owners = {e: owner_of_notebook(session, e) for e in [*shared, mine]}
    assert owners == {shared[0]: ANA, shared[1]: ANA, mine: BETO}
