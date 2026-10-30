"""The conversation read route: the notebook's thread, oldest first, with how each line came in."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Measurement, Trial, Turn
from app.models.enums import Role, Source
from app.repositories import turns
from tests.factories import make_notebook


def test_turns_come_oldest_first_with_their_source(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    turns.add_turn(session, nb.experiment_id, Role.USER, "ensayo 1, 50 grados", Source.VOICE)
    turns.add_turn(session, nb.experiment_id, Role.ASSISTANT, "Guardé el ensayo 1.", None)
    turns.add_turn(session, nb.experiment_id, Role.USER, "¿cuál fue el mejor?", Source.TEXT)
    body = authed.get(f"/api/experiments/{nb.experiment_id}/turns").json()
    assert [(t["role"], t["source"], t["text"]) for t in body] == [
        ("user", "voice", "ensayo 1, 50 grados"),
        ("assistant", None, "Guardé el ensayo 1."),
        ("user", "text", "¿cuál fue el mejor?"),
    ]
    assert all("created_at" in t and "id" in t for t in body)


def test_an_empty_thread_and_an_unknown_notebook(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    assert authed.get(f"/api/experiments/{nb.experiment_id}/turns").json() == []
    missing = authed.get("/api/experiments/999999999/turns")
    assert missing.status_code == 404 and missing.json()["code"] == "experiment_not_found"
    assert authed.get("/api/experiments/0/turns").status_code == 404


def test_turns_need_a_session(client: TestClient) -> None:
    assert client.get("/api/experiments/1/turns").status_code == 401


def test_a_line_carries_the_readings_it_saved(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    said = turns.add_turn(
        session, nb.experiment_id, Role.USER, "ensayo 4: cincuenta grados", Source.VOICE
    )
    reply = turns.add_turn(session, nb.experiment_id, Role.ASSISTANT, "Guardé el ensayo 4.", None)
    assert isinstance(said, Turn) and isinstance(reply, Turn)
    trial = Trial(experiment_id=nb.experiment_id, number=4)
    session.add(trial)
    session.flush()
    assert trial.id is not None
    at = datetime.now(UTC)
    session.add_all(
        Measurement(
            trial_id=trial.id,
            variable_id=variable_id,
            value=value,
            unit=unit,
            original_phrase="ensayo 4: cincuenta grados",
            source=Source.VOICE,
            said_at=at,
            said_text=words,
            turn_id=said.id,
        )
        for variable_id, value, unit, words in [
            (nb.rend, 73, "%", "setenta y tres por ciento"),
            (nb.temp, 50, "°C", "cincuenta grados"),
        ]
    )
    session.commit()

    user, assistant = authed.get(f"/api/experiments/{nb.experiment_id}/turns").json()
    assert [(r["variable"], r["said_text"], r["value"], r["unit"]) for r in user["readings"]] == [
        ("Temperatura", "cincuenta grados", 50, "°C"),
        ("Rendimiento", "setenta y tres por ciento", 73, "%"),
    ]
    assert user["readings"][0]["trial_number"] == 4
    assert assistant["readings"] == []
