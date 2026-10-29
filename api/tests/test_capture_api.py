"""The capture routes end to end (spec 0006, AC-1 to AC-8, AC-13, AC-14, AC-16, AC-17,
AC-20, AC-24). A scripted FakeProvider stands in for the model; the database is real and
rolled back after each test."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, col, func, select

from app.ai.deps import get_provider
from app.ai.provider import Decision, ProviderFailure
from app.ai.providers.fake import FakeProvider
from app.ai.tools import (
    Confirmar,
    Corregir,
    Descartar,
    ElegirEnsayo,
    ExtractedValue,
    ProponerMedicion,
    ToolCall,
)
from app.main import app
from app.models import Measurement, Turn
from app.models.enums import Role, Source
from app.repositories import proposals, turns
from app.services.turn_plan import TurnContext
from tests.factories import Notebook, make_notebook

Json = dict[str, Any]
AC1 = "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento"


@pytest.fixture
def nb(session: Session) -> Notebook:
    return make_notebook(session)


@pytest.fixture
def script(authed: TestClient) -> Iterator[list[ToolCall | ProviderFailure]]:
    """Append the tool calls the model should return, in order."""
    steps: list[ToolCall | ProviderFailure] = []
    provider = FakeProvider(steps)
    app.dependency_overrides[get_provider] = lambda: provider
    # FakeProvider reads the list lazily through an iterator made at construction, so
    # appending later still feeds it.
    yield steps


def ev(variable_id: int, number_text: str, value: float, unit: str | None = None) -> ExtractedValue:
    return ExtractedValue(
        variable_id=variable_id, number_text=number_text, value=value, unit_text=unit
    )


def say(client: TestClient, nb: Notebook, text: str) -> Json:
    response = client.post(f"/api/experiments/{nb.experiment_id}/utterances", json={"text": text})
    assert response.status_code == 200, response.json()
    return response.json()


def ac1_call(nb: Notebook) -> ProponerMedicion:
    return ProponerMedicion(
        trial_number=6,
        values=[
            ev(nb.temp, "65", 65, "grados"),
            ev(nb.dur, "20", 20, "minutos"),
            ev(nb.rend, "74", 74, "por ciento"),
        ],
    )


def measurements(session: Session) -> int:
    return session.exec(select(func.count()).select_from(Measurement)).one()


def values(body: Json) -> list[Any]:
    return [v["value"] for v in body["proposal"]["values"]]


# --- AC-1, AC-2, AC-20 ---


def test_a_full_sentence_then_confirm(
    authed: TestClient, session: Session, nb: Notebook, script: list[Any]
) -> None:
    before = measurements(session)
    script.append(ac1_call(nb))
    body = say(authed, nb, AC1)
    card = body["proposal"]
    assert card["trial_number"] == 6 and values(body) == [65, 20, 74]
    assert [v["said_text"] for v in card["values"]] == ["65 grados", "20 minutos", "74 por ciento"]
    assert card["phrase"] == AC1 and card["source"] == "text"
    assert body["reply"] == {"reason": "ready", "text": "¿Lo guardo?"} and card["can_confirm"]
    assert measurements(session) == before
    turns = session.exec(
        select(Turn).where(Turn.experiment_id == nb.experiment_id).order_by(col(Turn.id))
    ).all()
    assert [(t.role, t.tool_name) for t in turns] == [("user", None), ("assistant", "ready")]

    saved = authed.post(f"/api/proposals/{card['id']}/confirm").json()
    assert saved["saved"]["trial_number"] == 6 and saved["saved"]["created"]
    assert saved["reply"]["text"] == "Guardado el ensayo 6." and saved["proposal"] is None
    again = authed.post(f"/api/proposals/{card['id']}/confirm").json()
    assert again["saved"]["trial_id"] == saved["saved"]["trial_id"]
    rows = session.exec(
        select(Measurement).where(Measurement.trial_id == saved["saved"]["trial_id"])
    ).all()
    assert sorted(m.said_text or "" for m in rows) == ["20 minutos", "65 grados", "74 por ciento"]


def test_typing_si_confirms_and_with_no_card_replies_no_pending(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [ac1_call(nb), Confirmar(), Confirmar()]
    say(authed, nb, AC1)
    body = say(authed, nb, "sí, guárdalo")
    assert body["saved"]["trial_number"] == 6 and body["reply"]["reason"] == "saved"
    assert say(authed, nb, "sí")["reply"]["reason"] == "no_pending"


# --- AC-3, AC-4, AC-5 ---


def test_parts_corrections_and_a_hand_edit(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [
        ProponerMedicion(trial_number=6, values=[ev(nb.temp, "65", 65, "grados")]),
        ProponerMedicion(values=[ev(nb.rend, "74", 74)]),
        Corregir(values=[ev(nb.rend, "setenta y tres", 73)]),
    ]
    first = say(authed, nb, "Ensayo 6, 65 grados")
    assert first["reply"]["text"] == "Me falta Duración y Rendimiento. ¿Cuánto fueron?"
    assert first["proposal"]["can_confirm"]  # a partial trial may be saved
    second = say(authed, nb, "rendimiento 74")
    assert second["proposal"]["id"] == first["proposal"]["id"]
    third = say(authed, nb, "No, el rendimiento es setenta y tres")
    assert values(third) == [65, None, 73]
    rend = third["proposal"]["values"][2]
    assert rend["said_text"] == "setenta y tres" and rend["interpreted"]

    card_id = third["proposal"]["id"]
    edited = authed.put(f"/api/proposals/{card_id}/values/{nb.rend}", json={"value": 72}).json()
    assert values(edited) == [65, None, 72]
    assert edited["proposal"]["values"][2]["said_text"] is None
    assert edited["proposal"]["phrase"] == "Editado: Rendimiento 72 %"
    assert edited["turn_id"] is not None


# --- AC-6, AC-7, AC-8 ---


def test_no_trial_number_blocks_confirm(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [ProponerMedicion(values=[ev(nb.temp, "50", 50)]), ProponerMedicion(trial_number=6)]
    body = say(authed, nb, "temperatura 50 grados")
    assert (
        body["reply"]["text"] == "¿Qué número de ensayo es?" and not body["proposal"]["can_confirm"]
    )
    response = authed.post(f"/api/proposals/{body['proposal']['id']}/confirm")
    assert response.status_code == 422 and response.json()["code"] == "missing_trial_number"
    assert say(authed, nb, "ensayo 6")["proposal"]["trial_number"] == 6


def _save_trial_3(authed: TestClient, nb: Notebook, script: list[Any]) -> None:
    script += [
        ProponerMedicion(trial_number=3, values=[ev(nb.temp, "50", 50), ev(nb.rend, "74", 74)]),
        Confirmar(),
    ]
    say(authed, nb, "ensayo 3, temperatura 50, rendimiento 74")
    say(authed, nb, "sí")


def test_a_repeated_trial_asks_and_correction_shows_previous(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    _save_trial_3(authed, nb, script)
    script += [
        ProponerMedicion(trial_number=3, values=[ev(nb.rend, "73", 73)]),
        ElegirEnsayo(kind="correccion"),
    ]
    body = say(authed, nb, "ensayo 3, rendimiento 73")
    assert body["reply"]["reason"] == "choose_trial" and not body["proposal"]["can_confirm"]
    card_id = body["proposal"]["id"]
    blocked = authed.post(f"/api/proposals/{card_id}/confirm")
    assert blocked.status_code == 409 and blocked.json()["code"] == "trial_exists"

    chosen = say(authed, nb, "es corrección")
    rend = chosen["proposal"]["values"][2]
    assert (rend["previous"], rend["value"]) == (74, 73)
    saved = authed.post(f"/api/proposals/{card_id}/confirm").json()
    assert saved["saved"]["trial_number"] == 3 and not saved["saved"]["created"]


def test_choose_new_trial_by_button(authed: TestClient, nb: Notebook, script: list[Any]) -> None:
    _save_trial_3(authed, nb, script)
    script.append(ProponerMedicion(trial_number=3, values=[ev(nb.rend, "73", 73)]))
    card_id = say(authed, nb, "ensayo 3, rendimiento 73")["proposal"]["id"]
    body = authed.post(f"/api/proposals/{card_id}/trial", json={"kind": "new"}).json()
    assert body["proposal"]["trial_number"] is None and body["reply"]["reason"] == "missing_trial"
    body = authed.post(
        f"/api/proposals/{card_id}/trial", json={"kind": "new", "trial_number": 7}
    ).json()
    assert body["proposal"]["trial_number"] == 7 and body["proposal"]["can_confirm"]


def test_another_trial_while_one_is_pending(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [ac1_call(nb), ProponerMedicion(trial_number=7, values=[ev(nb.temp, "60", 60)])]
    say(authed, nb, AC1)
    body = say(authed, nb, "Ensayo 7, 60 grados")
    assert body["reply"]["text"] == "Tienes el ensayo 6 sin guardar. ¿Lo guardo o lo descarto?"
    assert body["proposal"]["trial_number"] == 6 and values(body) == [65, 20, 74]


# --- AC-13 ---


def test_discard(authed: TestClient, session: Session, nb: Notebook, script: list[Any]) -> None:
    before = measurements(session)
    script += [ac1_call(nb), Descartar()]
    card_id = say(authed, nb, AC1)["proposal"]["id"]
    body = authed.post(f"/api/proposals/{card_id}/discard").json()
    assert body["reply"]["text"] == "Descarté la tarjeta." and body["proposal"] is None
    assert say(authed, nb, "descártalo")["reply"]["reason"] == "no_pending"
    again = authed.post(f"/api/proposals/{card_id}/discard")
    assert again.status_code == 409 and again.json()["code"] == "not_pending"
    assert measurements(session) == before


# --- AC-14 ---


def test_llm_failure_is_503_and_keeps_the_card(
    authed: TestClient, session: Session, nb: Notebook, script: list[Any]
) -> None:
    script += [ac1_call(nb), ProviderFailure("fallback", "deadline")]
    card = say(authed, nb, AC1)["proposal"]
    response = authed.post(
        f"/api/experiments/{nb.experiment_id}/utterances", json={"text": "rendimiento 80"}
    )
    assert response.status_code == 503 and response.json()["code"] == "llm_unavailable"
    reloaded = authed.get(f"/api/experiments/{nb.experiment_id}/proposal").json()
    assert [v["value"] for v in reloaded["values"]] == [v["value"] for v in card["values"]]
    last = session.exec(
        select(Turn).where(Turn.experiment_id == nb.experiment_id).order_by(col(Turn.id).desc())
    ).first()
    assert last is not None and (last.role, last.text) == ("user", "rendimiento 80")


# --- AC-16, AC-17 ---


def test_input_rules(authed: TestClient, nb: Notebook, script: list[Any]) -> None:
    long = authed.post(f"/api/experiments/{nb.experiment_id}/utterances", json={"text": "a" * 501})
    assert long.status_code == 422 and long.json()["code"] == "invalid_text"
    blank = authed.post(f"/api/experiments/{nb.experiment_id}/utterances", json={"text": "   "})
    assert blank.json()["code"] == "invalid_text"
    missing = authed.post("/api/experiments/999999999/utterances", json={"text": "hola"})
    assert missing.status_code == 404 and missing.json()["code"] == "experiment_not_found"
    assert authed.post("/api/proposals/999999999/confirm").json()["code"] == "proposal_not_found"

    script.append(ac1_call(nb))
    card_id = say(authed, nb, AC1)["proposal"]["id"]
    other = make_notebook_variable_elsewhere(authed, nb)
    wrong = authed.put(f"/api/proposals/{card_id}/values/{other}", json={"value": 1})
    assert wrong.status_code == 404 and wrong.json()["code"] == "variable_not_in_experiment"


def make_notebook_variable_elsewhere(authed: TestClient, nb: Notebook) -> int:
    created = authed.post(
        "/api/experiments",
        json={"title": "Otro", "variables": [{"name": "pH", "unit": None, "required": True}]},
    )
    assert created.status_code == 201
    return created.json()["variables"][0]["id"]


def test_reload_shows_the_derived_question(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script.append(ProponerMedicion(trial_number=6, values=[ev(nb.temp, "65", 65)]))
    say(authed, nb, "Ensayo 6, 65 grados")
    card = authed.get(f"/api/experiments/{nb.experiment_id}/proposal").json()
    assert card["question"]["reason"] == "missing_values"
    assert authed.get("/api/experiments/999999999/proposal").status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/experiments/1/utterances"),
        ("GET", "/api/experiments/1/proposal"),
        ("PUT", "/api/proposals/1/values/1"),
        ("POST", "/api/proposals/1/trial"),
        ("POST", "/api/proposals/1/values/1/check"),
        ("POST", "/api/proposals/1/confirm"),
        ("POST", "/api/proposals/1/discard"),
    ],
)
def test_every_capture_route_needs_a_session(client: TestClient, method: str, path: str) -> None:
    assert client.request(method, path, json={}).status_code == 401


# --- AC-23, AC-24 ---


def test_a_flagged_card_needs_each_check(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [
        ProponerMedicion(
            trial_number=6,
            values=[ev(nb.temp, "65", 65), ev(nb.dur, "2", 2, "horas"), ev(nb.rend, "74", 74)],
        ),
        Confirmar(),
    ]
    body = say(authed, nb, "Ensayo 6, temperatura 65, duración 2 horas, rendimiento 74")
    card = body["proposal"]
    assert card["flagged"] and not card["can_confirm"]
    assert body["reply"]["text"] == "Antes de guardar, revisa Duración."
    assert card["values"][1]["flags"] == [
        {"reason": "converted", "text": "Convertí 2 horas a 120 min"}
    ]

    blocked = authed.post(f"/api/proposals/{card['id']}/confirm")
    assert blocked.status_code == 409 and blocked.json()["code"] == "unchecked_values"
    assert say(authed, nb, "sí, guárdalo")["reply"]["reason"] == "check_values"

    checked = authed.post(f"/api/proposals/{card['id']}/values/{nb.dur}/check").json()
    assert checked["turn_id"] is None and checked["proposal"]["can_confirm"]
    assert checked["reply"]["reason"] == "ready"
    assert authed.post(f"/api/proposals/{card['id']}/confirm").status_code == 200


def test_a_hand_edit_out_of_range_counts_as_checked(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script.append(ac1_call(nb))
    card_id = say(authed, nb, AC1)["proposal"]["id"]
    body = authed.put(f"/api/proposals/{card_id}/values/{nb.temp}", json={"value": 500}).json()
    temp = body["proposal"]["values"][0]
    assert temp["flags"][0]["reason"] == "out_of_range" and temp["checked"]
    assert body["proposal"]["can_confirm"]


def test_choosing_correction_clears_checks(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    _save_trial_3(authed, nb, script)
    script.append(ProponerMedicion(trial_number=3, values=[ev(nb.dur, "2", 2, "horas")]))
    card_id = say(authed, nb, "ensayo 3, duración 2 horas")["proposal"]["id"]
    authed.post(f"/api/proposals/{card_id}/values/{nb.dur}/check")
    body = authed.post(f"/api/proposals/{card_id}/trial", json={"kind": "correction"}).json()
    dur = body["proposal"]["values"][1]
    assert not dur["checked"] and not dur["flags"]  # a correction is not flagged per value
    assert body["proposal"]["can_confirm"]


class ChangesTheCard:
    """Edits the pending card while "thinking", like a second tab would."""

    name = "fake"

    def __init__(self, session: Session, nb: Notebook, call: ToolCall) -> None:
        self._session, self._nb, self._call = session, nb, call

    async def decide(self, context: TurnContext, utterance: str) -> Decision:
        assert context.card is not None and context.card.id is not None
        turn = turns.add_turn(
            self._session, self._nb.experiment_id, Role.USER, "otra pestaña", Source.TEXT
        )
        assert isinstance(turn, Turn) and turn.id is not None
        proposals.set_trial(self._session, context.card.id, None, None)  # the number is cleared
        return Decision(self._call, self.name)


def test_a_card_changed_during_the_call_is_planned_again(
    authed: TestClient, session: Session, nb: Notebook, script: list[Any]
) -> None:
    script.append(ProponerMedicion(trial_number=6, values=[ev(nb.temp, "65", 65)]))
    say(authed, nb, "Ensayo 6, 65 grados")
    changer = ChangesTheCard(
        session, nb, ProponerMedicion(trial_number=7, values=[ev(nb.rend, "74", 74)])
    )
    app.dependency_overrides[get_provider] = lambda: changer
    body = say(authed, nb, "ensayo 7, rendimiento 74")
    # Against the old card (number 6 with values) this was pending_other_trial; against the
    # fresh card (no number) it sets 7 and adds the value.
    assert body["proposal"]["trial_number"] == 7
    assert values(body) == [65, None, 74]
