import logging
import time

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.access import (
    SESSION_COOKIE,
    SESSION_MAX_AGE_S,
    match_holder,
    record_attempt,
    sign_session,
)
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep, attempt_log, client_ip
from app.core.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/access", tags=["access"])


class AccessRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str = Field(min_length=1, max_length=200)


class AccessGranted(BaseModel):
    model_config = ConfigDict(frozen=True)

    holder: str


@router.post(
    "",
    responses={
        401: {"model": ApiErrorBody, "description": "The code matches no holder"},
        422: {"model": ApiErrorBody, "description": "The body is not {code: string}"},
        429: {"model": ApiErrorBody, "description": "More than 5 tries in a minute from this IP"},
    },
)
async def grant_access(body: AccessRequest, request: Request, response: Response) -> AccessGranted:
    # async on purpose: it runs on the event loop, so the attempt log never sees two writers.
    ip = client_ip(request)
    log = attempt_log(request)
    allowed, history = record_attempt(log.get(ip, ()), time.monotonic())
    log[ip] = history
    if not allowed:
        logger.warning("access rate limited")
        raise ApiError(
            429,
            "too_many_attempts",
            "Demasiados intentos. Espera un minuto y vuelve a probar.",
        )

    settings = get_settings()
    holder = match_holder(settings.access_codes, body.code)
    if holder is None:
        logger.info("access denied")
        raise ApiError(
            401,
            "invalid_access_code",
            "Ese código no es válido. Revisa que esté bien escrito.",
        )

    response.set_cookie(
        SESSION_COOKIE,
        sign_session(settings.session_secret, holder),
        max_age=SESSION_MAX_AGE_S,
        httponly=True,
        samesite="lax",
        # Safari drops Secure cookies on http://localhost, so only prod sets it.
        secure=settings.env != "dev",
    )
    logger.info("access granted", extra={"holder": holder})
    return AccessGranted(holder=holder)


@router.get(
    "",
    responses={401: {"model": ApiErrorBody, "description": "No valid access session"}},
)
def read_access(holder: HolderDep) -> AccessGranted:
    """Who is signed in, for the settings page."""
    return AccessGranted(holder=holder)


@router.delete("", status_code=204)
def revoke_access(response: Response) -> None:
    """Sign out: the cookie is httpOnly, so only the API can clear it."""
    response.delete_cookie(
        SESSION_COOKIE,
        httponly=True,
        samesite="lax",
        secure=get_settings().env != "dev",
    )
    logger.info("access revoked")
