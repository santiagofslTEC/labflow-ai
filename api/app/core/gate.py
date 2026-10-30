"""The access gate at the HTTP edge: reads the session cookie and rejects with 401."""

from typing import Annotated, cast

from fastapi import Depends, Request

from app.core.access import OPEN_PATHS, SESSION_COOKIE, read_session
from app.core.errors import ApiError
from app.core.principal import (
    Account,
    CodeHolder,
    KeyFor,
    Principal,
    holder_of,
    issuer_for,
    read_account,
)
from app.core.settings import get_settings

AttemptLog = dict[str, tuple[float, ...]]


_UNAUTHORIZED = ApiError(401, "unauthorized", "Tu sesión venció. Entra de nuevo.")


def _bearer(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    return token.strip() or None if scheme.lower() == "bearer" else None


def _key_for(request: Request) -> KeyFor | None:
    """The cached Supabase key set, or None when accounts are off (AC-10)."""
    return cast(KeyFor | None, getattr(request.app.state, "supabase_keys", None))


def current_principal(request: Request) -> Principal:
    """Who is calling (spec 0014, AC-5): a Supabase account from the bearer token the web
    app's proxy forwards, else an access code holder from the code cookie. Read once per
    request. Depend on it (PrincipalDep) where a route needs the owner."""
    cached: object = getattr(request.state, "principal", None)
    if isinstance(cached, Account | CodeHolder):
        return cached
    settings = get_settings()
    principal: Principal | None = None
    token = _bearer(request)
    key_for = _key_for(request)
    if token is not None and key_for is not None and settings.supabase_url:
        principal = read_account(token, key_for, issuer_for(settings.supabase_url))
        if principal is None:
            raise _UNAUTHORIZED
    else:
        cookie = request.cookies.get(SESSION_COOKIE)
        name = (
            read_session(settings.session_secret, cookie, settings.access_codes) if cookie else None
        )
        principal = CodeHolder(name) if name is not None else None
    if principal is None:
        raise _UNAUTHORIZED
    request.state.principal = principal
    return principal


def current_holder(request: Request) -> str:
    """The signed in person's readable name (an account's email or a code's name).
    Depend on it (HolderDep) wherever a route needs it."""
    return holder_of(current_principal(request))


PrincipalDep = Annotated[Principal, Depends(current_principal)]
HolderDep = Annotated[str, Depends(current_holder)]


def require_access(request: Request) -> None:
    """App wide dependency: every route except OPEN_PATHS needs a valid session."""
    if request.url.path in OPEN_PATHS:
        return
    current_principal(request)


def client_ip(request: Request) -> str:
    # Vercel's rewrite sets X-Forwarded-For to the browser's address; Railway appends its own.
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


def attempt_log(request: Request) -> AttemptLog:
    """Per IP access attempts, held on app.state (created in the lifespan, not at module level)."""
    return cast(AttemptLog, request.app.state.access_attempts)
