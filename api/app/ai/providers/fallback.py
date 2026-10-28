"""The hedged race (spec 0006): Ollama starts at once; Claude starts when Ollama fails,
returns invalid output, or has not answered after `OLLAMA_HEDGE_S`. The first valid call
wins and the other is cancelled, all inside `LLM_DEADLINE_S`. Every fallback is logged."""

import asyncio
import logging

from app.ai.provider import Decision, LLMProvider, ProviderFailure
from app.services.turn_plan import TurnContext

logger = logging.getLogger(__name__)

type Outcome = Decision | ProviderFailure


class FallbackProvider:
    name = "fallback"

    def __init__(
        self, primary: LLMProvider, backup: LLMProvider, hedge_s: float, deadline_s: float
    ) -> None:
        self._primary = primary
        self._backup = backup
        self._hedge_s = hedge_s
        self._deadline_s = deadline_s

    async def decide(self, context: TurnContext, utterance: str) -> Outcome:
        try:
            async with asyncio.timeout(self._deadline_s):
                return await self._race(context, utterance)
        except TimeoutError:
            logger.warning("llm deadline passed", extra={"deadline_s": self._deadline_s})
            return ProviderFailure(self.name, "deadline")

    async def _race(self, context: TurnContext, utterance: str) -> Outcome:
        first = asyncio.create_task(self._primary.decide(context, utterance))
        tasks: set[asyncio.Task[Outcome]] = {first}
        try:
            done, _ = await asyncio.wait(tasks, timeout=self._hedge_s)
            if done:
                outcome = first.result()
                if isinstance(outcome, Decision):
                    return outcome
                reason = f"{outcome.provider}_{outcome.reason}"
                tasks.discard(first)
            else:
                reason = f"{self._primary.name}_slow"
            logger.warning("llm fallback started", extra={"fallback_reason": reason})
            tasks.add(asyncio.create_task(self._backup.decide(context, utterance)))

            last: ProviderFailure | None = None
            while tasks:
                done, tasks = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    outcome = task.result()
                    if isinstance(outcome, Decision):
                        if outcome.provider == self._primary.name:
                            return outcome
                        return Decision(outcome.call, outcome.provider, reason)
                    last = outcome
                    logger.warning(
                        "llm provider failed",
                        extra={"provider": outcome.provider, "failure": outcome.reason},
                    )
            return last or ProviderFailure(self.name, "error")
        finally:
            for task in tasks | {first}:
                task.cancel()
