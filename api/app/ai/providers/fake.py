"""A scripted provider for tests and local clicking (spec 0006, `LLM_PROVIDER=fake`, refused
in prod). With a script it returns those calls in order; without one it reads the sentence
with simple keyword rules, enough to walk the flow with no keys."""

from collections.abc import Iterator, Sequence

from app.ai.provider import Decision, ProviderFailure
from app.ai.tools import (
    Confirmar,
    Descartar,
    ElegirEnsayo,
    ExtractedValue,
    PedirAclaracion,
    ProponerMedicion,
    ToolCall,
)
from app.services.numbers import find_numbers
from app.services.text import fold
from app.services.turn_plan import TurnContext


def read_by_rules(context: TurnContext, utterance: str) -> ToolCall:
    folded = fold(utterance)
    if "correccion" in folded:
        return ElegirEnsayo(kind="correccion")
    if "otro ensayo" in folded or "ensayo nuevo" in folded:
        return ElegirEnsayo(kind="nuevo")
    if "descart" in folded:
        return Descartar()
    spans = find_numbers(utterance)
    if not spans and ("si" in folded.split() or "guarda" in folded):
        return Confirmar()
    if "?" in utterance or "grafica" in folded:
        return PedirAclaracion(reason="not_supported_yet")
    trial = next((int(s.value) for s in spans if s.is_trial), None)
    values: list[ExtractedValue] = []
    for variable in context.variables:
        names = [fold(n) for n in (variable.name, *variable.aliases)]
        at = min((folded.find(n) for n in names if n in folded), default=-1)
        span = next((s for s in spans if not s.is_trial and at >= 0 and s.start > at), None)
        if span is not None:
            values.append(
                ExtractedValue(
                    variable_id=variable.id,
                    number_text=utterance[span.start : span.end],
                    value=span.value,
                )
            )
    return ProponerMedicion(trial_number=trial, values=values)


class FakeProvider:
    name = "fake"

    def __init__(self, script: Sequence[ToolCall | ProviderFailure] | None = None) -> None:
        self._script: Iterator[ToolCall | ProviderFailure] | None = (
            iter(script) if script is not None else None
        )

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure:
        if self._script is None:
            return Decision(read_by_rules(context, utterance), self.name)
        step = next(self._script)
        return step if isinstance(step, ProviderFailure) else Decision(step, self.name)
