"""Spec 0007: the pure voice pieces (task 1) and the Custom LLM brain (task 2: AC-3, AC-4,
AC-12 to AC-15). A scripted FakeProvider stands in for the model; the database is real and
rolled back after each test."""

import asyncio
import json
import logging
import time
from collections.abc import Iterator
from contextlib import nullcontext
from typing import Any, cast

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, col, func, select

from app.ai.deps import get_provider_factory
from app.ai.provider import Decision, ProviderFailure, SetupDecision
from app.ai.providers.fake import FakeProvider
from app.ai.tools import ExtractedValue, ProponerMedicion, ToolCall
from app.core.db import get_session_factory
from app.core.settings import get_settings
from app.main import app
from app.models import Measurement, Proposal, Trial, Turn
from app.models.enums import ProposalStatus, Source
from app.routers import voice
from app.services.replies import auto_saved_aloud
from app.services.turn_plan import TurnContext
from app.services.turns import Superseded, handle_utterance
from app.services.undo_rules import match_undo
from app.voice import sse
from app.voice.agent_config import LLM_PATH, build_payload, load_template, prod_url_problem
from app.voice.session import TOKEN_MAX_AGE_S, VoiceClaims, read_voice_token, sign_voice_token
from app.voice.sessions import (
    TURN_LIMIT,
    Action,
    RunFlags,
    TurnRun,
    VoiceSessions,
    digest_of,
    plan_request,
)
from tests.factories import Notebook, make_notebook

SECRET = "x" * 40
BEARER = "b" * 40
CLAIMS = VoiceClaims(sid="abc", holder="dev", experiment_id=3)
AC1 = "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento"
LLM = "/api/voice/llm/chat/completions"
SAVED_ALOUD = "Guardado ensayo 6: 65 °C, 20 min y 74 %. Di deshacer para quitarlo."


# --- pure pieces (task 1) ------------------------------------------------------------


def test_token_round_trips() -> None:
    assert read_voice_token(SECRET, sign_voice_token(SECRET, CLAIMS)) == CLAIMS


def test_token_signed_with_another_secret_is_refused() -> None:
    assert read_voice_token(SECRET, sign_voice_token("y" * 40, CLAIMS)) is None
    assert read_voice_token(SECRET, "not-a-token") is None


def test_last_user_text_skips_assistant_and_system() -> None:
    messages = [
        {"role": "system", "content": "x"},
        {"role": "assistant", "content": "Te escucho. Dicta el ensayo."},
        {"role": "user", "content": "  Ensayo 7, sesenta y cinco grados "},
        {"role": "assistant", "content": "later"},
    ]
    assert sse.last_user_text(messages) == "Ensayo 7, sesenta y cinco grados"
    assert sse.last_user_text([{"role": "assistant", "content": "x"}]) is None
    assert sse.last_user_text("nope") is None
    assert sse.count_user_messages(messages) == 1
    assert sse.count_user_messages("nope") == 0


def test_chunk_is_an_openai_delta() -> None:
    event = sse.chunk("id1", 1, "Guardado ensayo 7")
    assert event.startswith("data: ") and event.endswith("\n\n")
    body = json.loads(event.removeprefix("data: "))
    assert body["choices"][0]["delta"] == {"role": "assistant", "content": "Guardado ensayo 7"}
    final = json.loads(sse.chunk("id1", 1, "", finish=True).removeprefix("data: "))
    assert final["choices"][0] == {"index": 0, "delta": {}, "finish_reason": "stop"}


def test_payload_fills_url_and_secret_without_touching_the_template() -> None:
    template = load_template()
    payload = build_payload(template, "dev", "https://tunnel.example/", "sec_1")
    custom = payload["conversation_config"]["agent"]["prompt"]["custom_llm"]  # type: ignore[index]
    assert custom["url"] == "https://tunnel.example" + LLM_PATH  # type: ignore[index]
    assert custom["api_key"] == {"secret_id": "sec_1"}  # type: ignore[index]
    assert payload["name"] == "LabFlow captura (dev)"
    assert "url" not in template["conversation_config"]["agent"]["prompt"]["custom_llm"]  # type: ignore[index]
    assert "built_in_tools" not in payload["conversation_config"]["agent"]["prompt"]  # type: ignore[index]


def test_prod_sync_refuses_a_url_that_is_not_railway() -> None:
    railway = "labflow-ai-production.up.railway.app"
    assert prod_url_problem("prod", f"https://{railway}", railway) is None
    assert prod_url_problem("prod", "https://abc.lhr.life", railway) is not None
    assert prod_url_problem("prod", f"http://{railway}", railway) is not None
    assert prod_url_problem("prod", f"https://{railway}", None) is not None
    assert prod_url_problem("dev", "https://abc.lhr.life", None) is None


def test_agent_answers_sooner_and_sends_tentative_words() -> None:
    """Round 2 (AC-21, AC-26): normal eagerness with speculative turns, and the browser gets
    the words you are still saying."""
    config = load_template()["conversation_config"]
    assert config["turn"]["turn_eagerness"] == "normal"  # type: ignore[index]
    assert config["turn"]["speculative_turn"] is True  # type: ignore[index]
    events = config["conversation"]["client_events"]  # type: ignore[index]
    assert {"tentative_user_transcript", "user_transcript", "agent_response", "audio"} <= set(
        events  # type: ignore[arg-type]
    )


# --- turn keys, replays, and the write gate (AC-14) ----------------------------------


def _run(digest: str) -> TurnRun:
    # plan_request reads only the digest and the count, never the task.
    return TurnRun(digest, cast(Any, None), RunFlags())


def test_plan_request_joins_supersedes_starts_and_limits() -> None:
    turns = {1: _run(digest_of("ensayo 6"))}
    assert plan_request(turns, 1, digest_of("ensayo 6")) is Action.JOIN
    assert plan_request(turns, 1, digest_of("ensayo 6, 65 grados")) is Action.SUPERSEDE
    assert plan_request(turns, 2, digest_of("ensayo 6")) is Action.START
    full = {k: _run(str(k)) for k in range(1, TURN_LIMIT + 1)}
    assert plan_request(full, TURN_LIMIT + 1, "new") is Action.LIMIT
    assert plan_request(full, TURN_LIMIT, str(TURN_LIMIT)) is Action.JOIN


def test_a_superseded_run_may_not_write() -> None:
    flags = RunFlags()
    assert flags.may_write() and flags.wrote
    late = RunFlags(superseded=True)
    assert not late.may_write() and not late.wrote


def test_sessions_open_get_end_and_expire() -> None:
    sessions = VoiceSessions()
    sessions.open(CLAIMS, now=100.0)
    assert sessions.get(CLAIMS, now=101.0) is not None
    other_holder = VoiceClaims(sid="abc", holder="ana", experiment_id=3)
    assert sessions.get(other_holder, now=101.0) is None
    assert sessions.get(CLAIMS, now=100.0 + TOKEN_MAX_AGE_S) is None  # 25 min
    assert not sessions.end("abc", "ana")
    assert sessions.end("abc", "dev")
    assert sessions.get(CLAIMS, now=101.0) is None
    assert not sessions.end("abc", "dev")


# --- the Custom LLM route ------------------------------------------------------------


@pytest.fixture
def bearer(monkeypatch: pytest.MonkeyPatch) -> str:
    # The remote test database can take over a second, so the filler waits longer here.
    settings = get_settings().model_copy(
        update={"voice_llm_secret": BEARER, "voice_filler_after_s": 60.0}
    )
    monkeypatch.setattr(voice, "get_settings", lambda: settings)
    return BEARER


def _sessions() -> VoiceSessions:
    return cast(VoiceSessions, app.state.voice_sessions)


def _open(holder: str, experiment_id: int, sid: str = "sid-1", at: float | None = None) -> str:
    claims = VoiceClaims(sid=sid, holder=holder, experiment_id=experiment_id)
    _sessions().open(claims, time.monotonic() if at is None else at)
    return sign_voice_token(get_settings().session_secret, claims)


def _messages(*sentences: str) -> list[dict[str, str]]:
    """The history as ElevenLabs sends it: system, the first message, then user and assistant
    turns; the last sentence is the newest user message."""
    history = [
        {"role": "system", "content": "x"},
        {"role": "assistant", "content": "Te escucho. Dicta el ensayo."},
    ]
    for i, sentence in enumerate(sentences):
        history.append({"role": "user", "content": sentence})
        if i < len(sentences) - 1:
            history.append({"role": "assistant", "content": "ok"})
    return history


def _post(
    client: TestClient, token: str | None, *sentences: str, stream: bool = True, **extra: object
) -> httpx.Response:
    body: dict[str, object] = {"messages": _messages(*sentences), "stream": stream, **extra}
    if token is not None:
        body["elevenlabs_extra_body"] = {"session_token": token}
    return client.post(LLM, headers={"Authorization": f"Bearer {BEARER}"}, json=body)


def _spoken(response: httpx.Response) -> str:
    """The text a streamed answer speaks, from its chat completion deltas."""
    assert response.status_code == 200, response.text
    assert response.text.endswith(sse.DONE)
    events = [e.removeprefix("data: ") for e in response.text.split("\n\n") if e]
    deltas = [json.loads(e)["choices"][0]["delta"] for e in events if e != "[DONE]"]
    return "".join(d.get("content", "") for d in deltas)


def test_custom_llm_without_bearer_is_401(client: TestClient, bearer: str) -> None:
    response = client.post(LLM, json={"messages": []})
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"
    wrong = client.post(LLM, headers={"Authorization": "Bearer nope"}, json={"messages": []})
    assert wrong.status_code == 401


def test_custom_llm_refuses_missing_forged_unknown_ended_and_expired_tokens(
    client: TestClient, bearer: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert _post(client, None, AC1).status_code == 401
    forged = sign_voice_token("z" * 40, VoiceClaims(sid="sid-1", holder="dev", experiment_id=1))
    assert _post(client, forged, AC1).status_code == 401
    never_opened = sign_voice_token(
        get_settings().session_secret, VoiceClaims(sid="nobody", holder="dev", experiment_id=1)
    )
    assert _post(client, never_opened, AC1).status_code == 401

    ended = _open("dev", 1, sid="ended")
    assert _sessions().end("ended", "dev")
    assert _post(client, ended, AC1).status_code == 401

    old = _open("dev", 1, sid="old", at=time.monotonic() - TOKEN_MAX_AGE_S - 1)
    assert _post(client, old, AC1).status_code == 401

    real_time = time.time
    with monkeypatch.context() as past:
        past.setattr(time, "time", lambda: real_time() - TOKEN_MAX_AGE_S - 60)
        expired = _open("dev", 1, sid="expired")
    assert _post(client, expired, AC1).status_code == 401


def test_voice_session_routes_need_the_access_cookie(client: TestClient) -> None:
    assert client.post("/api/voice/session", json={"experiment_id": 1}).status_code == 401
    assert client.delete("/api/voice/session/abc").status_code == 401


def test_ending_a_session_is_204_then_404(authed: TestClient, holder: str) -> None:
    _open(holder, 1, sid="mine")
    _open("someone-else", 1, sid="theirs")
    assert authed.delete("/api/voice/session/mine").status_code == 204
    gone = authed.delete("/api/voice/session/mine")
    assert gone.status_code == 404 and gone.json()["code"] == "voice_session_not_found"
    assert authed.delete("/api/voice/session/theirs").status_code == 404


# --- the brain: one voice turn through handle_utterance ------------------------------


@pytest.fixture
def nb(session: Session) -> Notebook:
    return make_notebook(session)


class SlowProvider:
    """The scripted fake, answering after `delay` seconds."""

    name = "fake"

    def __init__(self, inner: FakeProvider, delay: float) -> None:
        self.inner, self.delay = inner, delay

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure:
        await asyncio.sleep(self.delay)
        return await self.inner.decide(context, utterance)

    async def propose_setup(self, instructions: str) -> SetupDecision | ProviderFailure:
        return await self.inner.propose_setup(instructions)


@pytest.fixture
def delay() -> list[float]:
    return [0.0]


@pytest.fixture
def script(
    authed: TestClient,
    session: Session,
    bearer: str,
    delay: list[float],
) -> Iterator[list[ToolCall | ProviderFailure]]:
    """Append the tool calls the model should return, in order. Voice turns open their own
    session, so they get the rolled back test session here."""
    steps: list[ToolCall | ProviderFailure] = []
    fake = FakeProvider(steps)
    app.dependency_overrides[get_session_factory] = lambda: lambda: nullcontext(session)
    app.dependency_overrides[get_provider_factory] = lambda: (
        lambda _holder: SlowProvider(fake, delay[0]) if delay[0] else fake
    )
    yield steps


def ac1_call(nb: Notebook) -> ProponerMedicion:
    def ev(variable_id: int, text: str, value: float, unit: str) -> ExtractedValue:
        return ExtractedValue(
            variable_id=variable_id, number_text=text, value=value, unit_text=unit
        )

    return ProponerMedicion(
        trial_number=6,
        values=[
            ev(nb.temp, "65", 65, "grados"),
            ev(nb.dur, "20", 20, "minutos"),
            ev(nb.rend, "74", 74, "por ciento"),
        ],
    )


def _measurements(session: Session) -> int:
    return session.exec(select(func.count()).select_from(Measurement)).one()


def _turns(session: Session, nb: Notebook) -> list[Turn]:
    query = select(Turn).where(Turn.experiment_id == nb.experiment_id).order_by(col(Turn.id))
    return list(session.exec(query).all())


def test_a_voice_turn_runs_the_capture_turn_and_speaks_our_reply(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    before = _measurements(session)
    script.append(ac1_call(nb))
    token = _open(holder, nb.experiment_id)
    spoken = _spoken(_post(authed, token, AC1))
    assert spoken == SAVED_ALOUD  # our server wrote it: the saved values read back (AC-5)
    assert _measurements(session) == before + 3
    turns = _turns(session, nb)
    assert [(t.role, t.source, t.text) for t in turns] == [
        ("user", Source.VOICE, AC1),
        ("assistant", None, "Guardé el ensayo 6."),  # the DB keeps source on user turns only
    ]


def test_tools_are_ignored_and_a_non_streaming_request_gets_one_completion(
    authed: TestClient, nb: Notebook, holder: str, script: list[Any]
) -> None:
    script.append(ac1_call(nb))
    token = _open(holder, nb.experiment_id)
    response = _post(
        authed, token, AC1, stream=False, tools=[{"type": "function"}], tool_choice="auto"
    )
    assert response.status_code == 200
    choice = response.json()["choices"][0]
    assert choice["message"] == {"role": "assistant", "content": SAVED_ALOUD}
    assert choice["finish_reason"] == "stop" and "tool_calls" not in choice["message"]


def test_a_replayed_turn_speaks_the_stored_reply_and_saves_once(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    before = _measurements(session)
    script.append(ac1_call(nb))  # one model answer only: a replay must not ask again
    token = _open(holder, nb.experiment_id)
    first = _spoken(_post(authed, token, AC1))
    again = _spoken(_post(authed, token, AC1))
    assert first == again == SAVED_ALOUD
    assert _measurements(session) == before + 3
    assert [t.role for t in _turns(session, nb)] == ["user", "assistant"]


def test_a_brain_failure_is_spoken_not_cached_and_saying_it_again_runs_anew(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    before = _measurements(session)
    script += [ProviderFailure("fallback", "deadline"), ac1_call(nb)]
    token = _open(holder, nb.experiment_id)
    assert _spoken(_post(authed, token, AC1)) == "No pude procesarlo. Repítelo o escríbelo."
    assert _measurements(session) == before
    assert _spoken(_post(authed, token, AC1)) == SAVED_ALOUD
    assert _measurements(session) == before + 3


def test_the_61st_turn_speaks_the_limit_and_runs_nothing(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    token = _open(holder, nb.experiment_id)
    active = _sessions().active["sid-1"]
    active.turns.update({k: _run(str(k)) for k in range(1, TURN_LIMIT + 1)})
    sentences = ["algo"] * TURN_LIMIT + [AC1]
    spoken = _spoken(_post(authed, token, *sentences))
    assert spoken == "Llegaste al límite de esta sesión. Empieza otra."
    assert _turns(session, nb) == []


def test_a_slow_reply_starts_with_the_filler_which_is_never_stored(
    authed: TestClient,
    session: Session,
    nb: Notebook,
    holder: str,
    script: list[Any],
    delay: list[float],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fast = voice.get_settings().model_copy(update={"voice_filler_after_s": 0.05})
    monkeypatch.setattr(voice, "get_settings", lambda: fast)
    delay[0] = 0.3
    script.append(ac1_call(nb))
    token = _open(holder, nb.experiment_id)
    assert _spoken(_post(authed, token, AC1)) == f"A ver. {SAVED_ALOUD}"
    assert _turns(session, nb)[-1].text == "Guardé el ensayo 6."


def test_logs_carry_the_sid_never_the_sentence_or_the_token(
    authed: TestClient,
    nb: Notebook,
    holder: str,
    script: list[Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    script.append(ac1_call(nb))
    token = _open(holder, nb.experiment_id)
    with caplog.at_level(logging.DEBUG):
        _spoken(_post(authed, token, AC1))
    assert "sid-1" in caplog.text
    assert AC1 not in caplog.text and token not in caplog.text and BEARER not in caplog.text


def test_a_superseded_turn_writes_nothing_after_the_model(
    session: Session, nb: Notebook, holder: str
) -> None:
    before = _measurements(session)
    provider = FakeProvider([ac1_call(nb)])
    result = asyncio.run(
        handle_utterance(
            session, provider, nb.experiment_id, AC1, Source.VOICE, holder, lambda: False
        )
    )
    assert isinstance(result, Superseded)
    assert _measurements(session) == before
    assert [(t.role, t.source) for t in _turns(session, nb)] == [("user", Source.VOICE)]


# --- task 3: "deshacer" and partial turns (AC-5, AC-7, AC-14, on spec 0006's undo) -----


@pytest.mark.parametrize(
    ("sentence", "matched"),
    [
        ("deshacer", True),
        ("No, deshazlo", True),
        ("Quita el último", True),
        ("borra el ultimo, por favor", True),
        ("Ensayo 7, temperatura 65 grados", False),
        ("deshacerlo todo mañana", False),
    ],
)
def test_match_undo_reads_whole_words(sentence: str, matched: bool) -> None:
    assert match_undo(sentence) is matched


def test_auto_saved_aloud_reads_the_values_back() -> None:
    text = auto_saved_aloud(7, [(65.0, "°C"), (20.5, "min"), (74.0, None)])
    assert text == "Guardado ensayo 7: 65 °C, 20,5 min y 74. Di deshacer para quitarlo."


def _trials(session: Session, nb: Notebook) -> int:
    query = select(func.count()).select_from(Trial).where(Trial.experiment_id == nb.experiment_id)
    return session.exec(query).one()


def _pending(session: Session, nb: Notebook) -> Proposal | None:
    return session.exec(
        select(Proposal)
        .where(Proposal.experiment_id == nb.experiment_id)
        .where(Proposal.status == ProposalStatus.PENDING)
    ).first()


def test_deshacer_takes_back_the_last_auto_save_once(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    before = _measurements(session)
    script.append(ac1_call(nb))  # "deshacer" never reaches the model
    token = _open(holder, nb.experiment_id)
    assert _spoken(_post(authed, token, AC1)) == SAVED_ALOUD
    assert _spoken(_post(authed, token, AC1, "deshacer")) == "Deshecho: ensayo 6."
    assert _measurements(session) == before and _trials(session, nb) == 0
    assert _pending(session, nb) is None
    again = _spoken(_post(authed, token, AC1, "deshacer", "deshazlo"))
    assert again == "No hay nada que deshacer."


def test_deshacer_with_a_pending_card_discards_it(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    sentence = "Ensayo 6, temperatura 65 grados"
    script.append(
        ProponerMedicion(
            trial_number=6,
            values=[ExtractedValue(variable_id=nb.temp, number_text="65", value=65)],
        )
    )
    token = _open(holder, nb.experiment_id)
    _spoken(_post(authed, token, sentence))
    assert _pending(session, nb) is not None
    assert _spoken(_post(authed, token, sentence, "borra el último")) == "Descarté la tarjeta."
    assert _pending(session, nb) is None


def test_a_longer_version_of_a_saved_turn_takes_the_first_save_back(
    authed: TestClient, session: Session, nb: Notebook, holder: str, script: list[Any]
) -> None:
    before = _measurements(session)
    script += [ac1_call(nb), ac1_call(nb)]
    token = _open(holder, nb.experiment_id)
    assert _spoken(_post(authed, token, AC1)) == SAVED_ALOUD
    # The same turn key arrives again with more words: the newest request wins.
    assert _spoken(_post(authed, token, AC1 + ", listo")) == SAVED_ALOUD
    assert _measurements(session) == before + 3 and _trials(session, nb) == 1
