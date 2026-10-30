"""The notebook routes end to end (spec 0005, AC-14 to AC-17)."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, col, delete, func, select

from app.models import Experiment, Measurement, Trial, Turn, Variable
from app.models.enums import Role, Source
from app.repositories.experiments import create_experiment
from app.services.experiment_rules import NewExperiment, NewVariable
from app.services.results import DuplicateVariableName

SAMPLE: dict[str, Any] = {
    "title": "Rendimiento vs temperatura",
    "goal": "Ver cómo la temperatura cambia el rendimiento de la reacción.",
    "variables": [
        {"name": "Temperatura", "unit": "°C", "min_value": 20, "max_value": 100, "required": True},
        {"name": "Duración", "unit": "min", "min_value": 0, "max_value": 180, "required": True},
        {"name": "Rendimiento", "unit": "%", "min_value": 0, "max_value": 100, "required": True},
    ],
}


def count_titled(session: Session, title: str) -> int:
    return session.exec(
        select(func.count()).select_from(Experiment).where(col(Experiment.title) == title)
    ).one()


def with_variables(*variables: dict[str, Any], title: str = "Prueba") -> dict[str, Any]:
    return {"title": title, "variables": list(variables)}


# --- AC-17: the access gate ---


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/api/experiments"), ("POST", "/api/experiments"), ("GET", "/api/experiments/1")],
)
def test_every_route_needs_a_session(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, path, json=SAMPLE if method == "POST" else None)
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


# --- AC-15, AC-16: create and open ---


def test_creates_the_sample_and_reads_it_back(
    authed: TestClient, session: Session, holder: str
) -> None:
    response = authed.post("/api/experiments", json=SAMPLE)
    assert response.status_code == 201
    created = response.json()
    assert created["title"] == SAMPLE["title"]
    assert created["goal"] == SAMPLE["goal"]
    assert created["status"] == "open"
    assert created["created_by"] == holder
    assert [v["name"] for v in created["variables"]] == ["Temperatura", "Duración", "Rendimiento"]
    assert [v["position"] for v in created["variables"]] == [0, 1, 2]
    assert created["variables"][0]["unit"] == "°C"
    assert created["variables"][1]["max_value"] == 180
    assert "location" not in response.headers

    opened = authed.get(f"/api/experiments/{created['id']}")
    assert opened.status_code == 200
    assert opened.json() == created

    stored = session.exec(select(Variable).where(Variable.experiment_id == created["id"])).all()
    assert all(v.aliases == [] for v in stored)


def test_trims_and_nulls_blank_fields(authed: TestClient) -> None:
    response = authed.post(
        "/api/experiments",
        json={
            "title": "  Con espacios  ",
            "goal": "   ",
            "variables": [{"name": " pH ", "unit": "  ", "min_value": 20.5, "required": False}],
        },
    )
    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "Con espacios"
    assert created["goal"] is None
    assert created["variables"][0] | {"id": 0} == {
        "id": 0,
        "name": "pH",
        "unit": None,
        "min_value": 20.5,
        "max_value": None,
        "required": False,
        "position": 0,
        "aliases": [],
    }


@pytest.mark.parametrize(
    "payload",
    [
        with_variables({"name": "A"}, title="   "),
        with_variables(*({"name": f"V{i}"} for i in range(13))),
        with_variables(),
        with_variables({"name": "A", "unit": "x" * 21}),
        {**with_variables({"name": "A"}), "goal": "x" * 1001},
        {**with_variables({"name": "A"}), "created_by": "otro"},
    ],
    ids=["blank title", "13 variables", "no variables", "long unit", "long goal", "created_by"],
)
def test_rejects_a_malformed_body(authed: TestClient, payload: dict[str, Any]) -> None:
    response = authed.post("/api/experiments", json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"


def test_rejects_nan_sent_as_raw_json(authed: TestClient, session: Session) -> None:
    # TestClient(json=...) cannot encode NaN, so the body is written by hand.
    raw = '{"title": "Con NaN", "variables": [{"name": "A", "min_value": NaN}]}'
    response = authed.post(
        "/api/experiments", content=raw, headers={"content-type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"
    assert count_titled(session, "Con NaN") == 0


def test_rejects_a_duplicate_name_and_stores_nothing(authed: TestClient, session: Session) -> None:
    payload = with_variables({"name": "Temperatura"}, {"name": " temperatura "}, title="Dup")
    response = authed.post("/api/experiments", json=payload)
    assert response.status_code == 422
    assert response.json() == {
        "code": "duplicate_variable_name",
        "message": "Hay dos variables llamadas «temperatura». Cambia una.",
    }
    assert count_titled(session, "Dup") == 0


def test_rejects_min_above_max_and_stores_nothing(authed: TestClient, session: Session) -> None:
    payload = with_variables({"name": "Temp", "min_value": 90, "max_value": 80}, title="Rango")
    response = authed.post("/api/experiments", json=payload)
    assert response.status_code == 422
    assert response.json() == {
        "code": "invalid_range",
        "message": "En «Temp», el mínimo no puede ser mayor que el máximo.",
    }
    assert count_titled(session, "Rango") == 0


def test_unique_index_backstop_rolls_back(session: Session, holder: str) -> None:
    # Skips the pure check on purpose, as if a case fold slipped past it.
    body = NewExperiment(
        title="Respaldo", variables=(NewVariable(name="Masa"), NewVariable(name="MASA"))
    )
    assert create_experiment(session, holder, body) == DuplicateVariableName(name=None)
    assert count_titled(session, "Respaldo") == 0


@pytest.mark.parametrize("experiment_id", ["999999999999", "0", "-1", str(2**63)])
def test_unknown_id_is_not_found(authed: TestClient, experiment_id: str) -> None:
    response = authed.get(f"/api/experiments/{experiment_id}")
    assert response.status_code == 404
    assert response.json() == {
        "code": "experiment_not_found",
        "message": "Este cuaderno no existe.",
    }


def test_non_integer_id_is_invalid(authed: TestClient) -> None:
    response = authed.get("/api/experiments/abc")
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"


# --- AC-14: the list ---


def add_experiment(session: Session, title: str, created_at: datetime) -> Experiment:
    experiment = Experiment(title=title, created_by="test", created_at=created_at)
    session.add(experiment)
    session.flush()
    return experiment


def test_lists_by_latest_activity_with_trial_counts(authed: TestClient, session: Session) -> None:
    now = datetime.now(UTC)
    busy = add_experiment(session, "Con actividad", now - timedelta(days=3))
    quiet = add_experiment(session, "Sin actividad", now - timedelta(days=2))
    talked = add_experiment(session, "Con turno", now - timedelta(days=4))
    assert busy.id is not None and quiet.id is not None and talked.id is not None

    variables = [
        Variable(experiment_id=busy.id, name=name, position=i) for i, name in enumerate("AB")
    ]
    trials = [
        Trial(experiment_id=busy.id, number=n, created_at=now - timedelta(days=3)) for n in (1, 2)
    ]
    session.add_all([*variables, *trials])
    session.flush()
    # Several measurements per trial must not multiply the trial count.
    session.add_all(
        Measurement(
            trial_id=trial.id,
            variable_id=variable.id,
            value=1.0,
            original_phrase="uno",
            source=Source.TEXT,
            said_at=now,
            confirmed_at=now - timedelta(hours=1),
        )
        for trial in trials
        for variable in variables
        if trial.id is not None and variable.id is not None
    )
    session.add(
        Turn(
            experiment_id=talked.id,
            role=Role.USER,
            text="hola",
            source=Source.TEXT,
            created_at=now - timedelta(days=1),
        )
    )
    session.flush()

    rows = authed.get("/api/experiments").json()
    by_id = {row["id"]: row for row in rows}
    order = [row["id"] for row in rows]

    assert order.index(busy.id) < order.index(talked.id) < order.index(quiet.id)
    assert by_id[busy.id]["trial_count"] == 2
    assert by_id[quiet.id]["trial_count"] == 0
    assert by_id[quiet.id]["status"] == "open"
    assert set(by_id[busy.id]) == {"id", "title", "status", "trial_count", "last_activity_at"}
    assert datetime.fromisoformat(by_id[quiet.id]["last_activity_at"]) == quiet.created_at
    assert datetime.fromisoformat(by_id[busy.id]["last_activity_at"]).utcoffset() == timedelta(0)


def test_ties_go_to_the_higher_id(authed: TestClient, session: Session) -> None:
    moment = datetime.now(UTC) + timedelta(days=1)
    first = add_experiment(session, "Empate 1", moment)
    second = add_experiment(session, "Empate 2", moment)
    order = [row["id"] for row in authed.get("/api/experiments").json()]
    assert order[:2] == [second.id, first.id]


def test_lists_nothing_when_there_are_no_notebooks(authed: TestClient, session: Session) -> None:
    session.exec(delete(Experiment))  # rolled back with the test
    response = authed.get("/api/experiments")
    assert response.status_code == 200
    assert response.json() == []
