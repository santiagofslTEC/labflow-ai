"""Supabase's public signing keys for access tokens (spec 0014, AC-5): fetched from the
project's JSON Web Key Set, cached for 10 minutes, and refetched when a token names a key
id the cache does not hold. I/O at the edge; held on app.state."""

import jwt

from app.core.principal import KeyFor, issuer_for

CACHE_S = 600


def supabase_keys(supabase_url: str | None) -> KeyFor | None:
    """None when accounts are off (no SUPABASE_URL): only access codes work then (AC-10)."""
    if not supabase_url:
        return None
    client = jwt.PyJWKClient(
        f"{issuer_for(supabase_url)}/.well-known/jwks.json", cache_keys=True, lifespan=CACHE_S
    )
    return lambda token: client.get_signing_key_from_jwt(token).key
