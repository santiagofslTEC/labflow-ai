"""The trials read route (spec 0007, AC-1). Rows are written straight to the rolled back
database, the way `proposals.confirm` leaves them."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Measurement, Trial
from app.models.enums import Source
from tests.factories import Notebook, make_notebook

T0 = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)


def save(
    session: Session,
    nb: Notebook,
    number: int,
    values: dict[int, float],
    at: datetime,
    edited_at: datetime | None = None,
) -> int:
    trial = Trial(experiment_id=nb.experiment_id, number=number, created_at=at)
    session.add(trial)
    session.flush()
    assert trial.id is not None
    session.add_all(
        Measurement(
            trial_id=trial.id,
            variable_id=variable_id,
            value=value,
            original_phrase=f"ensayo {number}",
            source=Source.TEXT,
            said_at=at,
            said_text=f"{value:g}",
            confirmed_at=at,
            edited_at=edited_at,
        )
        for variable_id, value in values.items()
    )
    session.commit()
    return trial.id


def test_trials_come_by_number_with_their_cells(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    save(session, nb, 3, {nb.temp: 50, nb.rend: 74.5}, T0)
    first = save(session, nb, 1, {nb.temp: 65}, T0 + timedelta(minutes=1))
    body = authed.get(f"/api/experiments/{nb.experiment_id}/trials").json()
    assert [t["number"] for t in body["trials"]] == [1, 3]
    one, three = body["trials"]
    assert one["id"] == first and [c["value"] for c in one["cells"]] == [65]
    assert [(c["variable_id"], c["value"]) for c in three["cells"]] == [
        (nb.temp, 50),
        (nb.rend, 74.5),
    ]
    assert three["cells"][1]["said_text"] == "74.5"


def test_recent_is_the_five_newest_counting_edits(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    save(
        session,
        nb,
        1,
        {nb.temp: 60, nb.dur: 10, nb.rend: 70},
        T0,
        edited_at=T0 + timedelta(hours=2),
    )
    save(session, nb, 2, {nb.temp: 61, nb.dur: 11, nb.rend: 71}, T0 + timedelta(hours=1))
    body = authed.get(f"/api/experiments/{nb.experiment_id}/trials").json()
    recent = [(r["trial_number"], r["value"]) for r in body["recent"]]
    assert len(recent) == 5
    assert recent[:3] == [(1, 70), (1, 10), (1, 60)]  # edited last, newest id first
    assert recent[3:] == [(2, 71), (2, 11)]
    assert body["recent"][0]["saved_at"].startswith("2026-10-29T14:00:00")


def test_an_empty_notebook_and_an_unknown_one(authed: TestClient, session: Session) -> None:
    nb = make_notebook(session)
    assert authed.get(f"/api/experiments/{nb.experiment_id}/trials").json() == {
        "trials": [],
        "recent": [],
    }
    missing = authed.get("/api/experiments/999999999/trials")
    assert missing.status_code == 404 and missing.json()["code"] == "experiment_not_found"
    assert authed.get("/api/experiments/0/trials").status_code == 404


def test_trials_need_a_session(client: TestClient) -> None:
    assert client.get("/api/experiments/1/trials").status_code == 401
