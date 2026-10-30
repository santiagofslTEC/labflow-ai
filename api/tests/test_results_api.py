"""The results summary route (spec 0009, AC-7): SQL aggregates over saved measurements."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Measurement
from tests.factories import make_notebook
from tests.test_trials_api import T0, save


def test_count_min_max_mean_and_the_trials_at_each_extreme(
    authed: TestClient, session: Session
) -> None:
    nb = make_notebook(session)
    save(session, nb, 1, {nb.temp: 50, nb.rend: 70}, T0)
    save(session, nb, 2, {nb.temp: 65, nb.rend: 82.5}, T0)
    save(session, nb, 3, {nb.temp: 50, nb.rend: 82.5}, T0)
    other = make_notebook(session, "Otro")
    save(session, other, 1, {other.temp: 999}, T0)

    body = authed.get(f"/api/experiments/{nb.experiment_id}/results").json()
    temp, dur, rend = body["variables"]
    assert temp == {
        "variable_id": nb.temp,
        "count": 3,
        "min": 50,
        "max": 65,
        "mean": 55,
        "min_trials": [1, 3],
        "max_trials": [2],
    }
    assert dur == {
        "variable_id": nb.dur,
        "count": 0,
        "min": None,
        "max": None,
        "mean": None,
        "min_trials": [],
        "max_trials": [],
    }
    assert (rend["min_trials"], rend["max_trials"]) == ([1], [2, 3])
    assert abs(rend["mean"] - 78.333333) < 1e-5


def test_an_edited_value_counts_at_its_new_value(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    trial = save(session, nb, 1, {nb.temp: 50}, T0)
    save(session, nb, 2, {nb.temp: 60}, T0)
    row = session.exec(select(Measurement).where(Measurement.trial_id == trial)).one()
    row.value, row.edited_at = 90, T0 + timedelta(hours=1)
    session.add(row)
    session.commit()
    temp = authed.get(f"/api/experiments/{nb.experiment_id}/results").json()["variables"][0]
    assert (temp["min"], temp["max"], temp["max_trials"]) == (60, 90, [1])


def test_an_unknown_notebook_and_the_session(
    authed: TestClient, client: TestClient, session: Session
) -> None:
    missing = authed.get("/api/experiments/999999999/results")
    assert missing.status_code == 404 and missing.json()["code"] == "experiment_not_found"
    nb = make_notebook(session)
    empty = authed.get(f"/api/experiments/{nb.experiment_id}/results").json()
    assert [v["count"] for v in empty["variables"]] == [0, 0, 0]
    assert client.get("/api/experiments/1/results").status_code == 401
