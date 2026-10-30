"""Supabase like access tokens for tests (spec 0014): a local P-256 key signs them, and the
gate is given its public half, so no test reaches Supabase."""

import time
from uuid import UUID, uuid4

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

SUPABASE_URL = "https://proyecto.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"

_PRIVATE = ec.generate_private_key(ec.SECP256R1())
PUBLIC = _PRIVATE.public_key()
_OTHER = ec.generate_private_key(ec.SECP256R1())


def key_for(_token: str) -> object:
    return PUBLIC


def mint(
    user_id: UUID | None = None,
    email: str = "ana@example.com",
    *,
    signed_by_other: bool = False,
    **claims: object,
) -> str:
    now = int(time.time())
    payload: dict[str, object] = {
        "sub": str(user_id or uuid4()),
        "email": email,
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 3600,
        "role": "authenticated",
        "app_metadata": {"provider": "email"},
        "user_metadata": {},
        "is_anonymous": False,
        **claims,
    }
    key = _OTHER if signed_by_other else _PRIVATE
    return jwt.encode(payload, key, algorithm="ES256", headers={"kid": "test"})
