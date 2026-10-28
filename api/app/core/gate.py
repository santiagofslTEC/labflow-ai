"""The access gate at the HTTP edge: reads the session cookie and rejects with 401."""

from typing import Annotated, cast

from fastapi import Depends, Request

from app.core.access import OPEN_PATHS, SESSION_COOKIE, read_session
from app.core.errors import ApiError
from app.core.settings import get_settings

AttemptLog = dict[str, tuple[float, ...]]


def current_holder(request: Request) -> str:
    """The signed in holder's name. Depend on it (HolderDep) wherever a route needs it."""
    settings = get_settings()
    token = request.cookies.get(SESSION_COOKIE)
    holder = read_session(settings.session_secret, token, settings.access_codes) if token else None
    if holder is None:
        raise ApiError(
            401,
            "unauthorized",
            "Tu acceso venció o no es válido. Escribe tu código de acceso para continuar.",
        )
    return holder


HolderDep = Annotated[str, Depends(current_holder)]


def require_access(request: Request) -> None:
    """App wide dependency: every route except OPEN_PATHS needs a valid session."""
    if request.url.path in OPEN_PATHS:
        return
    request.state.holder = current_holder(request)


def client_ip(request: Request) -> str:
    # Vercel's rewrite sets X-Forwarded-For to the browser's address; Railway appends its own.
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


def attempt_log(request: Request) -> AttemptLog:
    """Per IP access attempts, held on app.state (created in the lifespan, not at module level)."""
    return cast(AttemptLog, request.app.state.access_attempts)
