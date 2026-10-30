"""Who is calling (spec 0014): a Supabase account, verified from its access token, or an
access code holder from the code cookie. Pure: the signing keys come in as a function."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, cast
from uuid import UUID

import jwt

# The algorithms Supabase signs access tokens with when the project uses signing keys.
ALGORITHMS = ("ES256", "RS256")
AUDIENCE = "authenticated"

KeyFor = Callable[[str], object]  # the public key for a token, or raises jwt.PyJWTError


@dataclass(frozen=True, slots=True)
class Account:
    user_id: UUID
    email: str
    name: str
    provider: Literal["google", "email"]


@dataclass(frozen=True, slots=True)
class CodeHolder:
    name: str


type Principal = Account | CodeHolder


def holder_of(principal: Principal) -> str:
    """The readable name kept in `created_by`, `saved_by`, logs, and the per person limits:
    an account's email (unique), or the code's name."""
    return principal.email if isinstance(principal, Account) else principal.name


def owner_of(principal: Principal) -> UUID | None:
    """The notebook owner a principal sees and makes (AC-6): its user id, or None for the
    shared space of the access codes."""
    return principal.user_id if isinstance(principal, Account) else None


def _field(container: object, key: str) -> object:
    """One key of a JSON object claim, or None when the claim is not an object."""
    if not isinstance(container, dict):
        return None
    return cast(dict[str, object], container).get(key)


def issuer_for(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/auth/v1"


def read_account(token: str, key_for: KeyFor, issuer: str) -> Account | None:
    """The account a Supabase access token names (AC-5), or None when the signature, issuer,
    audience, or expiry is wrong, or the user is anonymous. Supabase issues no token to an
    unconfirmed email while "Confirm email" is on, so a valid token means a confirmed one."""
    try:
        key = key_for(token)
        claims: dict[str, object] = jwt.decode(
            token,
            key=key,  # pyright: ignore[reportArgumentType]
            algorithms=list(ALGORITHMS),
            audience=AUDIENCE,
            issuer=issuer,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.PyJWTError:
        return None
    if claims.get("is_anonymous") is True:
        return None
    email = claims.get("email")
    try:
        user_id = UUID(str(claims.get("sub")))
    except ValueError:
        return None
    if not isinstance(email, str) or not email:
        return None
    named = _field(claims.get("user_metadata"), "full_name") or _field(
        claims.get("user_metadata"), "name"
    )
    provider = "google" if _field(claims.get("app_metadata"), "provider") == "google" else "email"
    address = email.strip().lower()
    return Account(
        user_id=user_id,
        email=address,
        name=named.strip()[:80] if isinstance(named, str) and named.strip() else address,
        provider=provider,
    )
