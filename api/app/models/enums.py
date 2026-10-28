"""The value sets stored as `text` plus a named CHECK (spec 0002)."""

from enum import StrEnum


class ExperimentStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class ProposalStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DISCARDED = "discarded"
    SUPERSEDED = "superseded"


class Source(StrEnum):
    VOICE = "voice"
    TEXT = "text"


class Grounding(StrEnum):
    """How a value's number was found in the sentence (spec 0006): the model's quoted words,
    or the code side fallback. Null on a hand edit."""

    MODEL = "model"
    CODE = "code"


class Role(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


def check_in(column: str, values: type[StrEnum]) -> str:
    """SQL for a CHECK that keeps `column` inside the enum's values."""
    allowed = ", ".join(f"'{v.value}'" for v in values)
    return f"{column} IN ({allowed})"
