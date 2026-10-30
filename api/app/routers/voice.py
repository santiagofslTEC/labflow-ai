"""Voice conversation with an ElevenLabs Agent (spec 0007, API surface). `/voice/session` sits
behind the access session; `/voice/llm/chat/completions` is the agent's Custom LLM, open to
the internet and guarded by the shared bearer secret and our signed session token.

Build task 1 (the proof): the Custom LLM route logs what ElevenLabs sends (dev only) and
speaks back the sentence it heard, so a real Spanish call can confirm facts (a) to (e).
Task 2 replaces that reply with `handle_utterance(source="voice")`."""

import hmac
import logging
import secrets
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import cast

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.db import SessionDep
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep
from app.core.settings import get_settings
from app.models import Experiment
from app.voice import elevenlabs, sse
from app.voice.session import SIGNED_URL_LIFE_S, VoiceClaims, read_voice_token, sign_voice_token

router = APIRouter(prefix="/api/voice", tags=["voice"])

LLM_ROUTE = "/api/voice/llm/chat/completions"

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
    body: VoiceSessionRequest, holder: HolderDep, session: SessionDep
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
    return VoiceSession(
        sid=claims.sid,
        signed_url=signed_url,
        session_token=sign_voice_token(settings.session_secret, claims),
        expires_at=datetime.now(UTC) + timedelta(seconds=SIGNED_URL_LIFE_S),
    )


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


def _probe_log(request: Request, body: dict[str, object], claims: VoiceClaims | None) -> None:
    """Task 1 only, dev only: the facts the proof must confirm. Never runs in prod."""
    messages: object = body.get("messages")
    roles = (
        [m.get("role") for m in cast(list[dict[str, object]], messages)]
        if isinstance(messages, list)
        else None
    )
    log.warning(
        "voice probe: path=%s keys=%s roles=%s stream=%s extra_body=%s token_ok=%s last_user=%r",
        request.url.path,
        sorted(body),
        roles,
        body.get("stream"),
        body.get("elevenlabs_extra_body"),
        claims is not None,
        sse.last_user_text(body.get("messages")),
    )


async def _stream(text: str) -> AsyncIterator[str]:
    completion_id = f"chatcmpl-{secrets.token_hex(8)}"
    created = int(time.time())
    yield sse.chunk(completion_id, created, text)
    yield sse.chunk(completion_id, created, "", finish=True)
    yield sse.DONE


@router.post(LLM_ROUTE.removeprefix("/api/voice"), include_in_schema=False, response_model=None)
async def custom_llm(request: Request) -> StreamingResponse | JSONResponse:
    """The agent's Custom LLM: OpenAI chat completions in, our Spanish reply out (AC-3, AC-4)."""
    settings = get_settings()
    if not _bearer_ok(request, settings.voice_llm_secret):
        return _UNAUTHORIZED
    raw: object = await request.json()
    body = cast(dict[str, object], raw) if isinstance(raw, dict) else {}
    token = _session_token(body)
    claims = read_voice_token(settings.session_secret, token) if token else None
    if settings.env == "dev":
        _probe_log(request, body, claims)
    elif claims is None:
        return _UNAUTHORIZED

    heard = sse.last_user_text(body.get("messages"))
    if claims is None:
        text = "Prueba: no llegó el token de sesión."
    elif heard:
        text = f"Te oí: {heard}"
    else:
        text = "Prueba: no llegó ningún texto."

    if body.get("stream") is False:
        return JSONResponse(
            sse.completion(f"chatcmpl-{secrets.token_hex(8)}", int(time.time()), text)
        )
    return StreamingResponse(_stream(text), media_type="text/event-stream")
