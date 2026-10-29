"""Add, edit, and delete variables after a notebook exists (spec 0008, AC-2 to AC-8). The
database is real and rolled back after each test."""

from typing import Any

from fastapi.testclient import TestClient
from httpx import Response
from sqlmodel import Session, col, select

from app.models import (
    Experiment,
    Measurement,
    Proposal,
    ProposalValue,
    Trial,
    Turn,
    Variable,
)
from app.models.enums import ExperimentStatus, Role, Source
from app.repositories import proposals, turns
from tests.factories import Notebook, make_notebook
from tests.test_trials_api import T0, save

Json = dict[str, Any]


def variable(name: str, unit: str | None = None, **extra: object) -> Json:
    return {"name": name, "unit": unit, "required": True, **extra}


def add(client: TestClient, nb: Notebook, body: Json) -> Response:
    return client.post(f"/api/experiments/{nb.experiment_id}/variables", json=body)


def put(client: TestClient, variable_id: int, body: Json) -> Response:
    return client.put(f"/api/variables/{variable_id}", json=body)


def remove(client: TestClient, nb: Notebook, ids: list[int]) -> Response:
    return client.post(
        f"/api/experiments/{nb.experiment_id}/variables/delete", json={"variable_ids": ids}
    )


def names(client: TestClient, nb: Notebook) -> list[str]:
    detail = client.get(f"/api/experiments/{nb.experiment_id}").json()
    return [v["name"] for v in detail["variables"]]


# --- AC-2 ---


def test_a_new_variable_goes_last_and_the_13th_is_refused(
    authed: TestClient, session: Session
) -> None:
    nb = make_notebook(session)
    created = add(authed, nb, variable(" Presión ", "kPa", min_value=1, aliases=[" p ", "", "P"]))
    assert created.status_code == 422  # "p" and "P" are the same alias
    created = add(authed, nb, variable(" Presión ", "kPa", min_value=1, aliases=[" p ", ""]))
    assert created.status_code == 201, created.json()
    body = created.json()
    assert (body["name"], body["unit"], body["min_value"], body["aliases"]) == (
        "Presión",
        "kPa",
        1,
        ["p"],
    )
    assert names(authed, nb) == ["Temperatura", "Duración", "Rendimiento", "Presión"]
    for i in range(8):
        assert add(authed, nb, variable(f"Extra {i}")).status_code == 201
    full = add(authed, nb, variable("Una más"))
    assert full.status_code == 409 and full.json()["code"] == "variables_full"


# --- AC-3, AC-4 ---


def test_edit_replaces_every_field_and_keeps_the_rules(
    authed: TestClient, session: Session
) -> None:
    nb = make_notebook(session)
    edited = put(authed, nb.temp, variable("Temperatura del baño", "°C", max_value=120))
    assert edited.status_code == 200
    assert (edited.json()["name"], edited.json()["min_value"], edited.json()["max_value"]) == (
        "Temperatura del baño",
        None,
        120,
    )
    dup = put(authed, nb.dur, variable("temperatura DEL baño", "min"))
    assert dup.status_code == 422 and dup.json()["code"] == "duplicate_variable_name"
    bad = put(authed, nb.dur, variable("Duración", "min", min_value=9, max_value=2))
    assert bad.status_code == 422 and bad.json()["code"] == "invalid_range"
    assert put(authed, nb.dur, variable("Duración", "min")).status_code == 200  # own name


def test_the_unit_locks_once_a_value_is_saved(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    save(session, nb, 1, {nb.temp: 65}, T0)
    locked = put(authed, nb.temp, variable("Temperatura", "K"))
    assert locked.status_code == 409 and locked.json()["code"] == "unit_locked"
    assert put(authed, nb.temp, variable("Temp", "°C", min_value=0)).status_code == 200
    assert put(authed, nb.dur, variable("Duración", "h")).status_code == 200  # no values


# --- AC-5, AC-6 ---


def test_delete_takes_the_values_and_the_trials_left_empty(
    authed: TestClient, session: Session
) -> None:
    nb = make_notebook(session)
    only_temp = save(session, nb, 1, {nb.temp: 60}, T0)
    both = save(session, nb, 2, {nb.temp: 61, nb.rend: 70}, T0)
    other = make_notebook(session, "Otro")
    save(session, other, 1, {other.temp: 50}, T0)

    body = remove(authed, nb, [nb.temp, nb.dur]).json()
    assert body == {"variables": 2, "measurements": 2, "trials": 1}
    assert names(authed, nb) == ["Rendimiento"]
    assert session.get(Trial, only_temp) is None and session.get(Trial, both) is not None
    left = session.exec(select(Measurement.value).where(Measurement.trial_id == both)).all()
    assert left == [70]
    other_values = session.exec(
        select(Measurement).where(Measurement.variable_id == other.temp)
    ).all()
    assert len(other_values) == 1


def test_delete_keeps_one_variable_and_checks_the_ids(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    other = make_notebook(session, "Otro")
    last = remove(authed, nb, [nb.temp, nb.dur, nb.rend])
    assert last.status_code == 409 and last.json()["code"] == "last_variable"
    foreign = remove(authed, nb, [other.temp])
    assert foreign.status_code == 404 and foreign.json()["code"] == "variable_not_found"
    assert remove(authed, nb, [nb.temp, nb.temp]).status_code == 422
    assert remove(authed, nb, []).status_code == 422
    assert names(authed, nb) == ["Temperatura", "Duración", "Rendimiento"]


def test_a_pending_card_loses_only_the_deleted_value(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    turn = turns.add_turn(session, nb.experiment_id, Role.USER, "ensayo 4", Source.TEXT)
    assert isinstance(turn, Turn) and turn.id is not None
    card = proposals.start_proposal(session, nb.experiment_id, 4)
    assert isinstance(card, Proposal) and card.id is not None
    proposals.set_value(session, card.id, nb.temp, 65, turn.id)
    proposals.set_value(session, card.id, nb.rend, 74, turn.id)
    remove(authed, nb, [nb.temp])
    kept = session.exec(
        select(col(ProposalValue.variable_id)).where(ProposalValue.proposal_id == card.id)
    ).all()
    assert kept == [nb.rend]


# --- AC-8 ---


def test_a_closed_notebook_and_unknown_ids(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    experiment = session.get(Experiment, nb.experiment_id)
    assert experiment is not None
    experiment.status = ExperimentStatus.CLOSED
    session.add(experiment)
    session.commit()
    for response in (
        add(authed, nb, variable("Presión")),
        put(authed, nb.temp, variable("Temperatura", "°C")),
        remove(authed, nb, [nb.dur]),
    ):
        assert response.status_code == 409 and response.json()["code"] == "experiment_closed"
    assert session.get(Variable, nb.dur) is not None
    missing = add(authed, Notebook(999999999, 0, 0, 0), variable("X"))
    assert missing.status_code == 404 and missing.json()["code"] == "experiment_not_found"
    assert put(authed, 999999999, variable("X")).json()["code"] == "variable_not_found"


def test_the_variable_routes_need_a_session(client: TestClient) -> None:
    assert client.post("/api/experiments/1/variables", json={}).status_code == 401
    assert client.put("/api/variables/1", json={}).status_code == 401
    assert client.post("/api/experiments/1/variables/delete", json={}).status_code == 401
