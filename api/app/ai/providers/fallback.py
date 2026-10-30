"""The hedged race (spec 0006): Ollama starts at once; Claude starts when Ollama fails,
returns invalid output, or has not answered after `OLLAMA_HEDGE_S`. The first valid call
wins and the other is cancelled, all inside `LLM_DEADLINE_S`. Every fallback is logged.

Reading instructions (spec 0005, AC-33) runs the same race with its own timings,
`SETUP_HEDGE_S` and `SETUP_DEADLINE_S`."""

import asyncio
import dataclasses
import logging
from collections.abc import Awaitable, Callable

from app.ai.provider import Decision, LLMProvider, ProviderFailure, SetupDecision
from app.services.turn_plan import TurnContext

logger = logging.getLogger(__name__)

type Outcome = Decision | ProviderFailure


class FallbackProvider:
    name = "fallback"

    def __init__(
        self,
        primary: LLMProvider,
        backup: LLMProvider,
        hedge_s: float,
        deadline_s: float,
        *,
        setup_hedge_s: float,
        setup_deadline_s: float,
    ) -> None:
        self._primary = primary
        self._backup = backup
        self._hedge_s = hedge_s
        self._deadline_s = deadline_s
        self._setup_hedge_s = setup_hedge_s
        self._setup_deadline_s = setup_deadline_s

    @property
    def hedge_s(self) -> float:
        """When Claude starts on a capture turn (voice uses a shorter one, spec 0007 AC-23)."""
        return self._hedge_s

    async def decide(self, context: TurnContext, utterance: str) -> Outcome:
        return await self._within(
            lambda provider: provider.decide(context, utterance), self._hedge_s, self._deadline_s
        )

    async def propose_setup(self, instructions: str) -> SetupDecision | ProviderFailure:
        return await self._within(
            lambda provider: provider.propose_setup(instructions),
            self._setup_hedge_s,
            self._setup_deadline_s,
        )

    async def _within[T: (Decision, SetupDecision)](
        self,
        call: Callable[[LLMProvider], Awaitable[T | ProviderFailure]],
        hedge_s: float,
        deadline_s: float,
    ) -> T | ProviderFailure:
        try:
            async with asyncio.timeout(deadline_s):
                return await self._race(call, hedge_s)
        except TimeoutError:
            logger.warning("llm deadline passed", extra={"deadline_s": deadline_s})
            return ProviderFailure(self.name, "deadline")

    async def _race[T: (Decision, SetupDecision)](
        self, call: Callable[[LLMProvider], Awaitable[T | ProviderFailure]], hedge_s: float
    ) -> T | ProviderFailure:
        """One race for both calls: `call` runs the same method on either provider."""
        first = asyncio.ensure_future(call(self._primary))
        tasks: set[asyncio.Future[T | ProviderFailure]] = {first}
        try:
            done, _ = await asyncio.wait(tasks, timeout=hedge_s)
            if done:
                outcome = first.result()
                if not isinstance(outcome, ProviderFailure):
                    return outcome
                reason = f"{outcome.provider}_{outcome.reason}"
                tasks.discard(first)
            else:
                reason = f"{self._primary.name}_slow"
            logger.warning("llm fallback started", extra={"fallback_reason": reason})
            tasks.add(asyncio.ensure_future(call(self._backup)))

            last: ProviderFailure | None = None
            while tasks:
                done, tasks = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    outcome = task.result()
                    if not isinstance(outcome, ProviderFailure):
                        if outcome.provider == self._primary.name:
                            return outcome
                        return dataclasses.replace(outcome, fallback_reason=reason)
                    last = outcome
                    logger.warning(
                        "llm provider failed",
                        extra={"provider": outcome.provider, "failure": outcome.reason},
                    )
            return last or ProviderFailure(self.name, "error")
        finally:
            for task in tasks | {first}:
                task.cancel()
