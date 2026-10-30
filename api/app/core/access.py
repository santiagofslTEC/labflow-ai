"""Personal access codes (spec 0001, Access gate). Pure: no I/O, no clock, no app state."""

import hmac
from collections.abc import Mapping
from types import MappingProxyType

from itsdangerous import BadSignature, URLSafeTimedSerializer

SESSION_COOKIE = "labflow_session"
SESSION_MAX_AGE_S = 30 * 24 * 60 * 60
# Every route needs a valid session except these. The voice Custom LLM is called by ElevenLabs,
# which has no cookie: it checks its own bearer secret and session token (spec 0007, AC-13).
OPEN_PATHS = frozenset({"/api/health", "/api/access", "/api/voice/llm/chat/completions"})
ATTEMPT_LIMIT = 5
ATTEMPT_WINDOW_S = 60.0

_SALT = "labflow-session"


def parse_access_codes(raw: str) -> Mapping[str, str]:
    """`name:code` pairs, comma separated, as holder name → code. Malformed input is a bug in
    the config, so it raises and the API refuses to start."""
    pairs = [entry.strip() for entry in raw.split(",") if entry.strip()]
    if not pairs:
        raise ValueError("ACCESS_CODES needs at least one name:code pair")
    parsed: list[tuple[str, str]] = []
    for pair in pairs:
        name, sep, code = (part.strip() for part in pair.partition(":"))
        if not sep or not name or not code:
            raise ValueError("each ACCESS_CODES entry must look like name:code")
        parsed.append((name, code))
    names = [name for name, _ in parsed]
    codes = [code for _, code in parsed]
    if len(set(names)) != len(names) or len(set(codes)) != len(codes):
        raise ValueError("ACCESS_CODES names and codes must each be unique")
    return MappingProxyType(dict(parsed))


def match_holder(codes: Mapping[str, str], submitted: str) -> str | None:
    """The holder whose code equals `submitted`. Compares against every code in constant time,
    so timing never hints which one came close."""
    wanted = submitted.encode()
    matches = [name for name, code in codes.items() if hmac.compare_digest(code.encode(), wanted)]
    return matches[0] if matches else None


def _serializer(secret: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(secret, salt=_SALT)


def sign_session(secret: str, holder: str) -> str:
    return _serializer(secret).dumps(holder)


def read_session(secret: str, token: str, codes: Mapping[str, str]) -> str | None:
    """The holder named by a session token, or None when the signature is bad, the token is
    older than 30 days, or the holder was removed from ACCESS_CODES (that is how revoking works)."""
    try:
        holder: object = _serializer(secret).loads(token, max_age=SESSION_MAX_AGE_S)
    except BadSignature:  # also covers SignatureExpired
        return None
    return holder if isinstance(holder, str) and holder in codes else None


def record_attempt(history: tuple[float, ...], now: float) -> tuple[bool, tuple[float, ...]]:
    """Sliding window limit: whether one more try is allowed at `now`, and the new history."""
    recent = tuple(at for at in history if now - at < ATTEMPT_WINDOW_S)
    if len(recent) >= ATTEMPT_LIMIT:
        return False, recent
    return True, (*recent, now)
