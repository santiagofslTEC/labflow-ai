"""Voice conversation with an ElevenLabs Agent (spec 0007, API surface). `/voice/session` sits
behind the access session; `/voice/llm/chat/completions` is the agent's Custom LLM, open to
the internet and guarded by the shared bearer secret and our signed session token.

The Custom LLM runs the same capture turn as typing (`handle_utterance`, source `voice`) and
streams back our reply word for word. Each turn runs as its own task, so it finishes and is
cached even when ElevenLabs drops the request; replays and partial turns follow AC-14."""

import asyncio
import hmac
import json
import logging
import secrets
import time
import unicodedata
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import cast

import httpx
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.ai.deps import ProviderFactoryDep
from app.ai.provider import LLMProvider
from app.core.db import SessionDep, SessionFactory, SessionFactoryDep
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep
from app.core.settings import get_settings
from app.models import Experiment
from app.models.enums import Source
from app.repositories import proposals
from app.routers.capture import TEXT_MAX
from app.services.replies import Reason, auto_saved_aloud, reply_text
from app.services.results import ExperimentNotFound, NotPending, TrialNotInExperiment
from app.services.turns import Handled, LLMUnavailable, Superseded, run_turn
from app.voice import elevenlabs, sse
from app.voice.session import SIGNED_URL_LIFE_S, VoiceClaims, read_voice_token, sign_voice_token
from app.voice.sessions import (
    Action,
    ActiveSession,
    RunFlags,
    Spoken,
    TurnRun,
    VoiceSessionsDep,
    digest_of,
    forget_failed,
    plan_request,
)

router = APIRouter(prefix="/api/voice", tags=["voice"])

LLM_ROUTE = "/api/voice/llm/chat/completions"
# A whole sentence, so text to speech speaks it before the reply arrives (AC-22).
FILLER = "A ver. "
BRAIN_FAILED = "No pude procesarlo. Repítelo o escríbelo."

log = logging.getLogger(__name__)


class VoiceSessionRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    experiment_id: int = Field(ge=1, le=2**63 - 1)


class VoiceSession(BaseModel):
    model_config = ConfigDict(frozen=True)

    sid: str
    signed_url: str
    session_token: str
    expires_at: datetime


_UNAVAILABLE = ApiError(503, "voice_unavailable", "La voz no está disponible. Escribe la medición.")
_UNAUTHORIZED = JSONResponse(
    status_code=401,
    content=ApiErrorBody(code="unauthorized", message="No autorizado.").model_dump(),
)


@router.post(
    "/session",
    responses={
        401: {"model": ApiErrorBody, "description": "No valid access session"},
        404: {"model": ApiErrorBody, "description": "experiment_not_found"},
        503: {"model": ApiErrorBody, "description": "voice_unavailable"},
    },
)
async def start_session(
    body: VoiceSessionRequest, holder: HolderDep, session: SessionDep, sessions: VoiceSessionsDep
) -> VoiceSession:
    """A signed URL for the private agent plus our token for this holder and notebook (AC-1)."""
    if session.get(Experiment, body.experiment_id) is None:
        raise ApiError(404, "experiment_not_found", "Este cuaderno no existe.")
    settings = get_settings()
    if not settings.elevenlabs_api_key or not settings.elevenlabs_agent_id:
        raise _UNAVAILABLE
    async with httpx.AsyncClient() as client:
        signed_url = await elevenlabs.get_signed_url(
            client, settings.elevenlabs_api_key, settings.elevenlabs_agent_id
        )
    if signed_url is None:
        raise _UNAVAILABLE
    claims = VoiceClaims(
        sid=secrets.token_urlsafe(16), holder=holder, experiment_id=body.experiment_id
    )
    sessions.open(claims, time.monotonic())
    return VoiceSession(
        sid=claims.sid,
        signed_url=signed_url,
        session_token=sign_voice_token(settings.session_secret, claims),
        expires_at=datetime.now(UTC) + timedelta(seconds=SIGNED_URL_LIFE_S),
    )


@router.delete(
    "/session/{sid}",
    status_code=204,
    responses={
        401: {"model": ApiErrorBody, "description": "No valid access session"},
        404: {"model": ApiErrorBody, "description": "voice_session_not_found"},
    },
)
async def end_session(sid: str, holder: HolderDep, sessions: VoiceSessionsDep) -> None:
    """End a session (AC-1, AC-10); its token stops working at once (AC-13)."""
    if not sessions.end(sid, holder):
        raise ApiError(404, "voice_session_not_found", "Esta sesión de voz ya terminó.")


def _bearer_ok(request: Request, expected: str | None) -> bool:
    header = request.headers.get("authorization", "")
    scheme, _, given = header.partition(" ")
    if expected is None or scheme.lower() != "bearer" or not given:
        return False
    return hmac.compare_digest(given.encode(), expected.encode())


def _session_token(body: dict[str, object]) -> str | None:
    extra = body.get("elevenlabs_extra_body")
    if not isinstance(extra, dict):
        return None
    token: object = cast(dict[str, object], extra).get("session_token")
    return token if isinstance(token, str) else None


async def _body(request: Request) -> dict[str, object]:
    try:
        raw: object = await request.json()
    except ValueError:  # not JSON: treated like a body with no token
        return {}
    return cast(dict[str, object], raw) if isinstance(raw, dict) else {}


async def _run_turn(
    open_session: SessionFactory,
    provider: LLMProvider | None,
    claims: VoiceClaims,
    sentence: str,
    flags: RunFlags,
    older: TurnRun | None = None,
) -> Spoken:
    """One voice turn through the same pipeline as typing (AC-3). Any failure speaks the AC-12
    message and is not cached, so saying it again runs a new turn. `older` is the run this one
    superseded after it wrote: it is taken back in full first (spec 0011, AC-13)."""
    if older is not None:
        await asyncio.wait({older.task})
        before = older.task
        if not before.cancelled() and before.exception() is None:
            with open_session() as db:
                await run_in_threadpool(_take_back_run, db, before.result())
    with open_session() as db:
        result = await run_turn(
            db,
            provider,
            claims.experiment_id,
            sentence,
            Source.VOICE,
            claims.holder,
            flags.may_write,
        )
    match result:
        case Handled(response=response, started=started):
            saved, reply = response.saved, response.reply
            auto_saved = saved.proposal_id if saved is not None and saved.auto else None
            if saved is not None and reply is not None and reply.reason == Reason.AUTO_SAVED:
                aloud = auto_saved_aloud(
                    saved.trial_number, [(v.value, v.unit) for v in saved.values]
                )
                return Spoken(aloud, auto_saved=auto_saved, started=started)
            # A card left waiting: the full joined reply (spec 0011, AC-13).
            text = reply.text if reply else ""
            return Spoken(text, auto_saved=auto_saved, started=started)
        case Superseded():
            return Spoken("")
        case LLMUnavailable() | ExperimentNotFound() | NotPending() | TrialNotInExperiment():
            return Spoken(BRAIN_FAILED, keep=False)


def _take_back_run(db: Session, spoken: Spoken) -> None:
    """Undo an older run's auto save (dropping its values), then discard a card or empty
    selection it started that is still pending (spec 0011, AC-13)."""
    if spoken.auto_saved is not None:
        proposals.take_back(db, spoken.auto_saved)
    if spoken.started is not None:
        proposals.discard(db, spoken.started)  # not pending any more: a typed error, ignored


def _start_run(
    active: ActiveSession,
    claims: VoiceClaims,
    key: int,
    digest: str,
    open_session: SessionFactory,
    provider: LLMProvider | None,
    sentence: str,
    older: TurnRun | None = None,
) -> asyncio.Task[Spoken]:
    flags = RunFlags()
    task = asyncio.create_task(_run_turn(open_session, provider, claims, sentence, flags, older))
    run = TurnRun(digest, task, flags)
    active.turns[key] = run  # strong reference: the task lives as long as its cache entry

    def done(finished: asyncio.Task[Spoken]) -> None:
        if not finished.cancelled() and (crash := finished.exception()) is not None:
            log.error("voice turn crashed sid=%s key=%d", claims.sid, key, exc_info=crash)
        forget_failed(active.turns, key, run)

    task.add_done_callback(done)
    return task


def _answer(
    active: ActiveSession,
    claims: VoiceClaims,
    sentence: str,
    key: int,
    open_session: SessionFactory,
    provider: LLMProvider | None,
) -> tuple[str, Spoken | asyncio.Task[Spoken]]:
    """What this request speaks: a fixed reply now, or a turn's task (started or joined)."""
    if not sentence:
        return "empty", Spoken("", keep=False)
    if len(sentence) > TEXT_MAX:
        return "too_long", Spoken(BRAIN_FAILED, keep=False)
    digest = digest_of(sentence)
    action = plan_request(active.turns, key, digest)
    match action:
        case Action.LIMIT:
            return action.value, Spoken(reply_text(Reason.SESSION_LIMIT), keep=False)
        case Action.JOIN:
            return action.value, active.turns[key].task
        case Action.SUPERSEDE | Action.START:
            older: TurnRun | None = None
            if action is Action.SUPERSEDE:
                run = active.turns[key]
                run.flags.superseded = True
                older = run if run.flags.wrote else None  # its save is taken back first
            task = _start_run(active, claims, key, digest, open_session, provider, sentence, older)
            return action.value, task


async def _spoken(outcome: Spoken | asyncio.Task[Spoken]) -> Spoken:
    # Shielded: a dropped request never cancels the turn, so its reply is cached for a replay.
    return await asyncio.shield(outcome) if isinstance(outcome, asyncio.Task) else outcome


async def _stream(
    outcome: Spoken | asyncio.Task[Spoken], filler_after_s: float
) -> AsyncIterator[str]:
    completion_id = f"chatcmpl-{secrets.token_hex(8)}"
    created = int(time.time())
    if isinstance(outcome, asyncio.Task):
        done, _ = await asyncio.wait({outcome}, timeout=filler_after_s)
        if not done:
            yield sse.chunk(completion_id, created, FILLER)  # spoken, never stored (AC-22)
    spoken = await _spoken(outcome)
    if spoken.text:
        yield sse.chunk(completion_id, created, spoken.text)
    yield sse.chunk(completion_id, created, "", finish=True)
    yield sse.DONE


@router.post(LLM_ROUTE.removeprefix("/api/voice"), include_in_schema=False, response_model=None)
async def custom_llm(
    request: Request,
    sessions: VoiceSessionsDep,
    open_session: SessionFactoryDep,
    provider_for: ProviderFactoryDep,
) -> StreamingResponse | JSONResponse:
    """The agent's Custom LLM: OpenAI chat completions in, our Spanish reply out (AC-3, AC-4).
    `tools` and `tool_choice` are ignored; the answer is never a tool call."""
    settings = get_settings()
    if not _bearer_ok(request, settings.voice_llm_secret):
        return _UNAUTHORIZED
    body = await _body(request)
    token = _session_token(body)
    claims = read_voice_token(settings.session_secret, token) if token else None
    active = sessions.get(claims, time.monotonic()) if claims else None
    if claims is None or active is None:
        return _UNAUTHORIZED  # missing, forged, expired, or ended: before any DB or model work

    messages = body.get("messages")
    # NFC so every accent is one character: the number reader slices the text by index.
    sentence = unicodedata.normalize("NFC", sse.last_user_text(messages) or "").strip()
    key = sse.count_user_messages(messages)
    action, outcome = _answer(
        active, claims, sentence, key, open_session, provider_for(claims.holder)
    )
    streamed = body.get("stream") is not False
    # The sid only: never the transcript, the token, or the bearer (AC-15).
    log.info(
        json.dumps({"event": "voice_request", "sid": claims.sid, "key": key, "action": action})
    )
    if not streamed:
        spoken = await _spoken(outcome)
        return JSONResponse(
            sse.completion(f"chatcmpl-{secrets.token_hex(8)}", int(time.time()), spoken.text)
        )
    return StreamingResponse(
        _stream(outcome, settings.voice_filler_after_s), media_type="text/event-stream"
    )
