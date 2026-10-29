"""Live smoke test (spec 0006, AC-19): 10 sentences against each real provider, each
answered in 5 s or less, and each planned to the expected card. Deselected by default;
run with `uv run pytest -m live`. Skipped when the provider's key is missing."""

import asyncio
import time

import pytest

from app.ai.deps import make_clients
from app.ai.provider import Decision, LLMProvider
from app.ai.providers.anthropic import AnthropicProvider
from app.ai.providers.ollama import OllamaProvider
from app.ai.tools import Confirmar, Descartar, ElegirEnsayo, PedirAclaracion
from app.core.settings import get_settings
from app.services.card_state import CardInfo, ValueInfo, VariableInfo
from app.services.replies import Reason
from app.services.turn_plan import SetValue, StartProposal, TurnContext, plan_turn

pytestmark = pytest.mark.live

LIMIT_S = 5.0
TEMP, DUR, REND = 11, 12, 13
VARIABLES = (
    VariableInfo(TEMP, "Temperatura", "°C", True, 0, 20, 100, ("temp",)),
    VariableInfo(DUR, "Duración", "min", True, 1, 0, 180),
    VariableInfo(REND, "Rendimiento", "%", True, 2, 0, 100),
)
SAVED = {n: n for n in range(1, 6)}
CARD6 = CardInfo(10, 6, None, (ValueInfo(TEMP, 65, "65 grados"),))
NO_CARD = TurnContext(1, VARIABLES, None, SAVED)
WITH_CARD = TurnContext(1, VARIABLES, CARD6, SAVED)
CHOOSING = TurnContext(1, VARIABLES, CardInfo(10, 3, None, (ValueInfo(REND, 73, "73"),)), SAVED)


def values_of(context: TurnContext, call: object, sentence: str) -> dict[int, float]:
    plan = plan_turn(context, call, sentence)  # pyright: ignore[reportArgumentType]
    return {op.variable_id: op.value for op in plan.operations if isinstance(op, SetValue)}


# (context, sentence, check on the decision)
CASES = [
    (
        NO_CARD,
        "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento",
        lambda c, s: values_of(NO_CARD, c, s) == {TEMP: 65, DUR: 20, REND: 74},
    ),
    (
        NO_CARD,
        "Ensayo 7, temperatura setenta grados, rendimiento ochenta y uno coma cinco por ciento",
        lambda c, s: values_of(NO_CARD, c, s) == {TEMP: 70, REND: 81.5},
    ),
    (NO_CARD, "ensayo 8, duración 2 horas", lambda c, s: values_of(NO_CARD, c, s) == {DUR: 120}),
    (
        NO_CARD,
        "Ensayo 6, 65 grados",
        lambda c, s: StartProposal(6) in plan_turn(NO_CARD, c, s).operations,
    ),
    (WITH_CARD, "rendimiento 74", lambda c, s: values_of(WITH_CARD, c, s) == {REND: 74}),
    (
        WITH_CARD,
        "No, la temperatura es sesenta y tres",
        lambda c, s: values_of(WITH_CARD, c, s) == {TEMP: 63},
    ),
    (WITH_CARD, "sí, guárdalo", lambda c, s: isinstance(c, Confirmar)),
    (WITH_CARD, "descártalo", lambda c, s: isinstance(c, Descartar)),
    (
        CHOOSING,
        "es una corrección",
        lambda c, s: isinstance(c, ElegirEnsayo) and c.kind == "correccion",
    ),
    (
        NO_CARD,
        "¿Cuál ensayo tuvo el mejor rendimiento?",
        lambda c, s: (
            isinstance(c, PedirAclaracion)
            and plan_turn(NO_CARD, c, s).reason == Reason.NOT_SUPPORTED_YET
        ),
    ),
]


def providers() -> list[LLMProvider]:
    settings = get_settings()
    clients = make_clients(settings)
    found: list[LLMProvider] = []
    if clients.ollama:
        found.append(OllamaProvider(clients.ollama, settings.ollama_model))
    if clients.anthropic:
        found.append(
            AnthropicProvider(
                clients.anthropic,
                settings.anthropic_model,
                LIMIT_S,
                setup_timeout_s=settings.setup_claude_timeout_s,
                setup_max_tokens=settings.setup_max_tokens,
            )
        )
    return found


@pytest.mark.parametrize("name", ["ollama", "anthropic"])
def test_ten_sentences_in_time(name: str) -> None:
    chosen = [p for p in providers() if p.name == name]
    if not chosen:
        pytest.skip(f"no key for {name}")
    provider = chosen[0]

    async def run() -> list[tuple[str, float, object, bool]]:
        rows: list[tuple[str, float, object, bool]] = []
        for context, sentence, check in CASES:
            started = time.perf_counter()
            outcome = await provider.decide(context, sentence)
            elapsed = time.perf_counter() - started
            ok = isinstance(outcome, Decision) and bool(check(outcome.call, sentence))
            rows.append((sentence, elapsed, outcome, ok))
        return rows

    rows = asyncio.run(run())
    for sentence, elapsed, outcome, ok in rows:
        print(f"{name} {elapsed:4.2f}s {'ok ' if ok else 'BAD'} {sentence!r} -> {outcome}")
    assert all(ok for *_, ok in rows)
    assert all(elapsed <= LIMIT_S for _, elapsed, *_ in rows)
