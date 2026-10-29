"""A scripted provider for tests and local clicking (spec 0006, `LLM_PROVIDER=fake`, refused
in prod). With a script it returns those calls in order; without one it reads the sentence
with simple keyword rules, enough to walk the flow with no keys. Reading instructions works
the same way (spec 0005, AC-33): a setup script, or a fixed proposal built from the text."""

import re
from collections.abc import Iterator, Mapping, Sequence
from types import MappingProxyType

from app.ai.provider import Decision, ProviderFailure, SetupDecision
from app.ai.tools import (
    Confirmar,
    Descartar,
    ElegirEnsayo,
    ExtractedValue,
    PedirAclaracion,
    ProponerCuaderno,
    ProponerMedicion,
    ProposedVariable,
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


# Folded word in the text → (variable name, unit) the fake proposes.
_SETUP_WORDS: Mapping[str, tuple[str, str | None]] = MappingProxyType(
    {
        "temperatura": ("Temperatura", "°C"),
        "tiempo": ("Tiempo", "min"),
        "rendimiento": ("Rendimiento", "%"),
        "presion": ("Presión", "kPa"),
        "ph": ("pH", None),
        "concentracion": ("Concentración", "mol/L"),
        "masa": ("Masa", "g"),
        "volumen": ("Volumen", "mL"),
    }
)
_BETWEEN = re.compile(r"entre (-?\d+(?:[.,]\d+)?) y (-?\d+(?:[.,]\d+)?)[^\n.;,)]*")
_WORD = re.compile(r"[a-z]+")


def _number(text: str) -> float:
    return float(text.replace(",", "."))


def _range_after(folded: str, at: int) -> re.Match[str] | None:
    """The first "entre X y Y …" after `at` in the same sentence."""
    ends = (i for i in (folded.find(c, at) for c in ".;\n") if i >= 0)
    return _BETWEEN.search(folded, at, min(ends, default=len(folded)))


def read_setup_by_rules(instructions: str) -> ProponerCuaderno:
    """The first line as the title; one variable per known word, in the order the text first
    names them, with the first "entre X y Y …" in a sentence that names it as its range."""
    folded = fold(instructions)
    lines = [line.strip() for line in instructions.splitlines() if line.strip()]
    mentions: dict[str, list[int]] = {}
    for match in _WORD.finditer(folded):
        if match.group() in _SETUP_WORDS:
            mentions.setdefault(match.group(), []).append(match.start())
    variables: list[ProposedVariable] = []
    for word, ats in sorted(mentions.items(), key=lambda item: item[1][0]):
        name, unit = _SETUP_WORDS[word]
        between = next((m for m in (_range_after(folded, at) for at in ats) if m), None)
        if between is None:
            variables.append(ProposedVariable(name=name, unit=unit))
            continue
        variables.append(
            ProposedVariable(
                name=name,
                unit=unit,
                min_value=_number(between.group(1)),
                max_value=_number(between.group(2)),
                range_quote=instructions[between.start() : between.end()].strip(),
            )
        )
    return ProponerCuaderno(
        title=lines[0] if lines else "",
        goal=None,
        context=lines[1] if len(lines) > 1 else None,
        found_count=len(variables),
        variables=variables,
    )


class FakeProvider:
    name = "fake"

    def __init__(
        self,
        script: Sequence[ToolCall | ProviderFailure] | None = None,
        setup_script: Sequence[ProponerCuaderno | ProviderFailure] | None = None,
    ) -> None:
        self._script: Iterator[ToolCall | ProviderFailure] | None = (
            iter(script) if script is not None else None
        )
        self._setup_script: Iterator[ProponerCuaderno | ProviderFailure] | None = (
            iter(setup_script) if setup_script is not None else None
        )

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure:
        if self._script is None:
            return Decision(read_by_rules(context, utterance), self.name)
        step = next(self._script)
        return step if isinstance(step, ProviderFailure) else Decision(step, self.name)

    async def propose_setup(self, instructions: str) -> SetupDecision | ProviderFailure:
        if self._setup_script is None:
            return SetupDecision(read_setup_by_rules(instructions), self.name)
        step = next(self._setup_script)
        return step if isinstance(step, ProviderFailure) else SetupDecision(step, self.name)
