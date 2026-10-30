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
    PedirAclaracion,
    ProponerMedicion,
    ToolCall,
)
from app.main import app
from app.models import Measurement, Trial, Turn
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


PARTIAL = "Ensayo 6: temperatura 65 grados, duración 20 minutos"


def partial_call(nb: Notebook) -> ProponerMedicion:
    """A reading with Rendimiento missing: not clean, so the card stays pending (AC-27)."""
    return ProponerMedicion(
        trial_number=6, values=[ev(nb.temp, "65", 65, "grados"), ev(nb.dur, "20", 20, "minutos")]
    )


def measurements(session: Session) -> int:
    return session.exec(select(func.count()).select_from(Measurement)).one()


def values(body: Json) -> list[Any]:
    return [v["value"] for v in body["proposal"]["values"]]


# --- AC-1, AC-2, AC-20, AC-27, AC-30 ---


def test_a_clean_sentence_saves_without_the_card(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    script.append(ac1_call(nb))
    body = say(authed, nb, AC1)
    assert body["proposal"] is None
    assert body["reply"] == {"reason": "auto_saved", "text": "Guardé el ensayo 6."}
    saved = body["saved"]
    assert saved["trial_number"] == 6 and saved["created"] and saved["auto"]
    assert [(v["name"], v["value"], v["unit"]) for v in saved["values"]] == [
        ("Temperatura", 65, "°C"),
        ("Duración", 20, "min"),
        ("Rendimiento", 74, "%"),
    ]
    rows = session.exec(select(Measurement).where(Measurement.trial_id == saved["trial_id"])).all()
    assert sorted(m.said_text or "" for m in rows) == ["20 minutos", "65 grados", "74 por ciento"]
    assert {(m.saved_by, m.auto_saved, m.original_phrase) for m in rows} == {(holder, True, AC1)}
    turns = session.exec(
        select(Turn).where(Turn.experiment_id == nb.experiment_id).order_by(col(Turn.id))
    ).all()
    assert [(t.role, t.tool_name) for t in turns] == [("user", None), ("assistant", "auto_saved")]
    assert all(m.turn_id == turns[0].id for m in rows)


def test_a_partial_card_waits_then_confirm(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    before = measurements(session)
    script.append(partial_call(nb))
    body = say(authed, nb, PARTIAL)
    card = body["proposal"]
    assert card["trial_number"] == 6 and values(body) == [65, 20, None]
    assert [v["said_text"] for v in card["values"]] == ["65 grados", "20 minutos", None]
    assert card["phrase"] == PARTIAL and card["source"] == "text" and card["can_confirm"]
    assert body["reply"]["reason"] == "missing_values" and body["saved"] is None
    assert measurements(session) == before

    saved = authed.post(f"/api/proposals/{card['id']}/confirm").json()
    assert saved["saved"]["trial_number"] == 6 and saved["saved"]["created"]
    assert not saved["saved"]["auto"]
    assert saved["reply"]["text"] == "Guardado el ensayo 6." and saved["proposal"] is None
    again = authed.post(f"/api/proposals/{card['id']}/confirm").json()
    assert again["saved"]["trial_id"] == saved["saved"]["trial_id"]
    rows = session.exec(
        select(Measurement).where(Measurement.trial_id == saved["saved"]["trial_id"])
    ).all()
    assert {(m.saved_by, m.auto_saved) for m in rows} == {(holder, False)}


def test_typing_si_confirms_and_with_no_card_replies_no_pending(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [partial_call(nb), Confirmar(), Confirmar()]
    say(authed, nb, PARTIAL)
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
    script += [
        partial_call(nb),
        ProponerMedicion(trial_number=7, values=[ev(nb.temp, "60", 60)]),
    ]
    say(authed, nb, PARTIAL)
    body = say(authed, nb, "Ensayo 7, 60 grados")
    assert body["reply"]["text"] == "Tienes el ensayo 6 sin guardar. ¿Lo guardo o lo descarto?"
    assert body["proposal"]["trial_number"] == 6 and values(body) == [65, 20, None]


# --- AC-13 ---


def test_discard(authed: TestClient, session: Session, nb: Notebook, script: list[Any]) -> None:
    before = measurements(session)
    script += [partial_call(nb), Descartar()]
    card_id = say(authed, nb, PARTIAL)["proposal"]["id"]
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
    script += [partial_call(nb), ProviderFailure("fallback", "deadline")]
    card = say(authed, nb, PARTIAL)["proposal"]
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

    script.append(partial_call(nb))
    card_id = say(authed, nb, PARTIAL)["proposal"]["id"]
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
    script.append(partial_call(nb))
    card_id = say(authed, nb, PARTIAL)["proposal"]["id"]
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


# --- Follow-up answers: the real conversations from notebook 326 and the unitless case ---


@pytest.mark.parametrize(
    "answer_call",
    [ProponerMedicion(trial_number=5), PedirAclaracion(reason="ambiguous_variable")],
    ids=["model_reads_trial", "model_asks_again"],
)
def test_a_bare_number_answers_the_trial_question(
    authed: TestClient, nb: Notebook, script: list[Any], answer_call: ToolCall
) -> None:
    script += [ProponerMedicion(values=[ev(nb.temp, "65", 65, "grados")]), answer_call]
    asked = say(authed, nb, "temperatura 65 grados")
    assert asked["reply"]["reason"] == "missing_trial"
    body = say(authed, nb, "5")
    assert body["proposal"]["trial_number"] == 5 and values(body) == [65, None, None]
    assert body["reply"]["reason"] == "missing_values"


def test_a_bare_number_is_not_a_trial_unless_that_was_asked(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [
        ProponerMedicion(trial_number=6, values=[ev(nb.temp, "65", 65)]),
        PedirAclaracion(reason="ambiguous_variable"),
    ]
    say(authed, nb, "ensayo 6, temperatura 65")
    body = say(authed, nb, "5")
    assert body["proposal"]["trial_number"] == 6 and body["reply"]["reason"] == "ambiguous_variable"


def test_two_values_for_one_variable_asks_which_then_takes_the_answer(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [
        ProponerMedicion(values=[ev(nb.temp, "23", 23), ev(nb.temp, "71", 71)]),
        PedirAclaracion(reason="ambiguous_variable"),
    ]
    asked = say(authed, nb, "esnayo 5: temperatura reflujo 23 a 71")
    assert asked["reply"] == {
        "reason": "two_values",
        "text": "Dijiste 23 y 71 para Temperatura. ¿Cuál guardo?",
    }
    body = say(authed, nb, "71")
    assert values(body) == [71, None, None] and body["reply"]["reason"] == "missing_trial"


def test_si_accepts_the_one_suggested_variable(
    authed: TestClient, session: Session, nb: Notebook, script: list[Any]
) -> None:
    script += [
        PedirAclaracion(reason="ambiguous_variable", variable_ids=[nb.temp]),
        PedirAclaracion(reason="ambiguous_variable", variable_ids=[nb.temp]),
    ]
    asked = say(authed, nb, "reflujo 71 grados")
    assert asked["reply"]["text"] == "No sé a qué variable va ese valor. ¿Es Temperatura?"
    body = say(authed, nb, "si")
    temp = body["proposal"]["values"][0]
    assert (temp["value"], temp["said_text"]) == (71, "71 grados")
    assert body["proposal"]["phrase"] == "reflujo 71 grados"
    assert body["reply"]["reason"] == "missing_trial"


def test_a_bare_number_answers_which_variable_on_the_asked_trial(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    """The live loop of 2026-10-30 (AC-35): "71" used to ask the same question again."""
    script += [
        PedirAclaracion(reason="ambiguous_variable", variable_ids=[nb.temp]),
        PedirAclaracion(reason="ambiguous_variable"),
    ]
    say(authed, nb, "ensayo 20 temperatura 23 a 71 grados")
    body = say(authed, nb, "71")
    assert body["proposal"]["trial_number"] == 20
    assert values(body) == [71, None, None] and body["reply"]["reason"] == "missing_values"


def test_the_which_variable_question_says_o(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [PedirAclaracion(reason="ambiguous_variable")]
    text = say(authed, nb, "5")["reply"]["text"]
    assert text.endswith("¿Es Temperatura, Duración o Rendimiento?")


def test_a_lone_number_opens_no_card(authed: TestClient, nb: Notebook, script: list[Any]) -> None:
    """The second error pass (AC-36): "el 5" opened an empty card for ensayo 5."""
    script += [ProponerMedicion(trial_number=5)]
    body = say(authed, nb, "el 5")
    assert body["proposal"] is None and body["reply"]["reason"] == "ambiguous_variable"
    assert authed.get(f"/api/experiments/{nb.experiment_id}/proposal").json() is None


def test_si_after_a_question_with_several_candidates_does_not_guess(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [
        PedirAclaracion(reason="ambiguous_variable", variable_ids=[nb.temp, nb.dur]),
        Confirmar(),
    ]
    say(authed, nb, "71")
    assert say(authed, nb, "si")["reply"]["reason"] == "no_pending"


def test_a_unit_word_on_a_unitless_variable_is_taken_as_written(
    authed: TestClient, script: list[Any]
) -> None:
    created = authed.post(
        "/api/experiments",
        json={"title": "Test", "variables": [{"name": "temperatura", "unit": None}]},
    ).json()
    experiment_id, variable_id = created["id"], created["variables"][0]["id"]
    script.append(ProponerMedicion(values=[ev(variable_id, "65", 65, "grados")]))
    response = authed.post(
        f"/api/experiments/{experiment_id}/utterances", json={"text": "65 grados"}
    )
    body = response.json()
    value = body["proposal"]["values"][0]
    assert (value["value"], value["said_text"]) == (65, "65 grados")
    assert value["flags"] == [] and not value["interpreted"]
    assert body["reply"]["reason"] == "missing_trial"


# --- AC-27 to AC-31: save without the card, undo, the remembered trial ---


def test_undo_deletes_the_trial_and_reopens_the_same_card(
    authed: TestClient, session: Session, nb: Notebook, script: list[Any]
) -> None:
    before = measurements(session)
    script.append(ac1_call(nb))
    saved = say(authed, nb, AC1)["saved"]
    assert measurements(session) == before + 3
    proposal_id = session.exec(
        select(col(Measurement.proposal_id)).where(Measurement.trial_id == saved["trial_id"])
    ).first()
    body = authed.post(f"/api/proposals/{proposal_id}/undo").json()
    card = body["proposal"]
    assert card["id"] == proposal_id and card["trial_number"] == 6
    assert values(body) == [65, 20, 74] and card["can_confirm"]
    assert body["reply"]["reason"] == "ready" and body["saved"] is None
    assert measurements(session) == before
    assert session.get(Trial, saved["trial_id"]) is None
    last = session.exec(
        select(Turn).where(Turn.experiment_id == nb.experiment_id).order_by(col(Turn.id).desc())
    ).first()
    assert last is not None and (last.role, last.text) == ("user", "Deshecho: ensayo 6")

    again = authed.post(f"/api/proposals/{proposal_id}/undo")
    assert again.status_code == 409 and again.json()["code"] == "not_auto_saved"


def test_undo_ends_with_the_next_sentence(
    authed: TestClient, session: Session, nb: Notebook, script: list[Any]
) -> None:
    script += [ac1_call(nb), PedirAclaracion(reason="off_topic")]
    saved = say(authed, nb, AC1)["saved"]
    proposal_id = session.exec(
        select(col(Measurement.proposal_id)).where(Measurement.trial_id == saved["trial_id"])
    ).first()
    say(authed, nb, "hola")
    response = authed.post(f"/api/proposals/{proposal_id}/undo")
    assert response.status_code == 409 and response.json()["code"] == "undo_expired"
    assert session.get(Trial, saved["trial_id"]) is not None


def test_a_confirmed_save_cannot_be_undone(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script.append(partial_call(nb))
    card_id = say(authed, nb, PARTIAL)["proposal"]["id"]
    authed.post(f"/api/proposals/{card_id}/confirm")
    response = authed.post(f"/api/proposals/{card_id}/undo")
    assert response.status_code == 409 and response.json()["code"] == "not_auto_saved"
    assert authed.post("/api/proposals/999999999/undo").status_code == 404


def test_completing_a_card_by_parts_saves_it(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [partial_call(nb), ProponerMedicion(values=[ev(nb.rend, "74", 74)])]
    assert say(authed, nb, PARTIAL)["proposal"] is not None
    body = say(authed, nb, "rendimiento 74")
    assert body["saved"]["auto"] and body["proposal"] is None
    assert [v["value"] for v in body["saved"]["values"]] == [65, 20, 74]


def test_flagged_and_repeated_readings_still_show_the_card(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    _save_trial_3(authed, nb, script)
    script += [
        ProponerMedicion(
            trial_number=3, values=[ev(nb.temp, "50", 50), ev(nb.dur, "9", 9), ev(nb.rend, "7", 7)]
        ),
        Descartar(),
        ProponerMedicion(
            trial_number=8,
            values=[ev(nb.temp, "500", 500), ev(nb.dur, "9", 9), ev(nb.rend, "7", 7)],
        ),
    ]
    repeated = say(authed, nb, "ensayo 3, temperatura 50, duración 9, rendimiento 7")
    assert repeated["reply"]["reason"] == "choose_trial" and repeated["saved"] is None
    say(authed, nb, "descártalo")
    flagged = say(authed, nb, "ensayo 8, temperatura 500, duración 9, rendimiento 7")
    assert flagged["proposal"]["flagged"] and flagged["saved"] is None


def test_a_sentence_with_no_number_fills_the_remembered_trial(
    authed: TestClient, session: Session, nb: Notebook, script: list[Any]
) -> None:
    script += [partial_call(nb), Confirmar(), ProponerMedicion(values=[ev(nb.rend, "75", 75)])]
    say(authed, nb, PARTIAL)
    first = say(authed, nb, "sí")["saved"]
    body = say(authed, nb, "rendimiento 75")
    assert body["saved"]["auto"] and body["saved"]["trial_id"] == first["trial_id"]
    assert not body["saved"]["created"] and body["reply"]["text"] == "Guardé el ensayo 6."
    rows = session.exec(select(Measurement).where(Measurement.trial_id == first["trial_id"])).all()
    assert sorted(m.value for m in rows) == [20, 65, 75]


def test_replacing_a_value_of_the_remembered_trial_shows_the_correction(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script += [ac1_call(nb), ProponerMedicion(values=[ev(nb.rend, "75", 75)])]
    saved = say(authed, nb, AC1)["saved"]
    body = say(authed, nb, "rendimiento 75")
    card = body["proposal"]
    assert body["saved"] is None and card["target_trial_id"] == saved["trial_id"]
    assert (card["values"][2]["previous"], card["values"][2]["value"]) == (74, 75)


def test_a_slip_in_the_trial_word_still_reads_the_trial(
    authed: TestClient, nb: Notebook, script: list[Any]
) -> None:
    script.append(ProponerMedicion(trial_number=5, values=[ev(nb.temp, "65", 65)]))
    body = say(authed, nb, "esnayo 5: temperatura 65")
    assert body["proposal"]["trial_number"] == 5 and values(body) == [65, None, None]
