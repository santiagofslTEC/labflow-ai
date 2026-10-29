"""The `LLMProvider` interface (spec 0006, Providers): one sentence in, one validated tool
call or a typed failure out. Failures are values; the fallback chain decides what is next.
Spec 0005 adds a second call: experiment instructions in, one `proponer_cuaderno` out."""

from dataclasses import dataclass
from typing import Literal, Protocol

from app.ai.tools import ProponerCuaderno, ToolCall
from app.services.turn_plan import TurnContext

type FailureReason = Literal[
    "error", "timeout", "invalid_output", "refusal", "claude_cap", "no_key", "deadline"
]


@dataclass(frozen=True, slots=True)
class ProviderFailure:
    provider: str
    reason: FailureReason
    detail: str = ""


@dataclass(frozen=True, slots=True)
class Decision:
    call: ToolCall
    provider: str  # which provider answered
    fallback_reason: str | None = None  # why Claude was used, when it was


@dataclass(frozen=True, slots=True)
class SetupDecision:
    """The twin of `Decision` for reading instructions (spec 0005, AC-33)."""

    call: ProponerCuaderno
    provider: str
    fallback_reason: str | None = None


class LLMProvider(Protocol):
    name: str

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure: ...

    async def propose_setup(self, instructions: str) -> SetupDecision | ProviderFailure: ...
