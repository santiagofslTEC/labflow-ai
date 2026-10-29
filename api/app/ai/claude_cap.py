"""The Claude call cap (spec 0006): a sliding hour of call times per access code holder.
It lives in `app.state` (created in the lifespan), per process; with one Railway worker
that is the whole API, and it resets on redeploy."""

import asyncio
import time
from dataclasses import dataclass, field

from app.ai.provider import Decision, LLMProvider, ProviderFailure, SetupDecision
from app.services.turn_plan import TurnContext

WINDOW_S = 3600.0


def allow_call(
    history: tuple[float, ...], now: float, limit: int
) -> tuple[bool, tuple[float, ...]]:
    """Whether one more call fits in the window at `now`, and the new history."""
    recent = tuple(at for at in history if now - at < WINDOW_S)
    if len(recent) >= limit:
        return False, recent
    return True, (*recent, now)


@dataclass
class ClaudeCap:
    limit: int
    calls: dict[str, tuple[float, ...]] = field(default_factory=dict[str, tuple[float, ...]])
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def take(self, holder: str) -> bool:
        async with self.lock:
            allowed, history = allow_call(self.calls.get(holder, ()), time.monotonic(), self.limit)
            self.calls[holder] = history
            return allowed


class CappedProvider:
    """Claude behind the cap: reaching it counts as a Claude failure (`claude_cap`)."""

    def __init__(self, inner: LLMProvider, cap: ClaudeCap, holder: str) -> None:
        self.name = inner.name
        self._inner = inner
        self._cap = cap
        self._holder = holder

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure:
        if not await self._cap.take(self._holder):
            return ProviderFailure(self.name, "claude_cap")
        return await self._inner.decide(context, utterance)

    async def propose_setup(self, instructions: str) -> SetupDecision | ProviderFailure:
        """A read takes from the same hourly cap as a capture call (spec 0005, AC-33)."""
        if not await self._cap.take(self._holder):
            return ProviderFailure(self.name, "claude_cap")
        return await self._inner.propose_setup(instructions)
