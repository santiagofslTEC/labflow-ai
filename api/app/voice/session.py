"""The voice session token (spec 0007, Value sourcing). Pure, like the access cookie: an
`itsdangerous` signature over the session, the holder, and the notebook."""

from dataclasses import dataclass
from typing import cast

from itsdangerous import BadSignature, URLSafeTimedSerializer

TOKEN_MAX_AGE_S = 25 * 60
SIGNED_URL_LIFE_S = 15 * 60

_SALT = "labflow-voice-session"


@dataclass(frozen=True)
class VoiceClaims:
    sid: str
    holder: str
    experiment_id: int


def _serializer(secret: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(secret, salt=_SALT)


def sign_voice_token(secret: str, claims: VoiceClaims) -> str:
    return _serializer(secret).dumps(
        {"sid": claims.sid, "holder": claims.holder, "experiment_id": claims.experiment_id}
    )


def read_voice_token(secret: str, token: str) -> VoiceClaims | None:
    """The claims of a token we signed in the last 25 minutes, else None."""
    try:
        raw: object = _serializer(secret).loads(token, max_age=TOKEN_MAX_AGE_S)
    except BadSignature:  # also covers SignatureExpired
        return None
    if not isinstance(raw, dict):
        return None
    fields = cast(dict[str, object], raw)
    sid, holder, experiment_id = (fields.get(key) for key in ("sid", "holder", "experiment_id"))
    if isinstance(sid, str) and isinstance(holder, str) and type(experiment_id) is int:
        return VoiceClaims(sid=sid, holder=holder, experiment_id=experiment_id)
    return None
