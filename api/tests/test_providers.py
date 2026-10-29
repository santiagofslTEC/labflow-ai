"""The provider chain (spec 0006, AC-12, AC-14, AC-15). No network: fake providers stand in."""

import asyncio
import logging

import pytest
from pydantic import ValidationError

from app.ai.claude_cap import CappedProvider, ClaudeCap, allow_call
from app.ai.provider import Decision, LLMProvider, ProviderFailure, SetupDecision
from app.ai.providers.anthropic import tool_definitions as claude_tools
from app.ai.providers.fake import FakeProvider, read_by_rules
from app.ai.providers.fallback import FallbackProvider
from app.ai.tools import (
    Confirmar,
    Descartar,
    ElegirEnsayo,
    ProponerCuaderno,
    ProponerMedicion,
    parse_tool_call,
)
from app.core.settings import Settings
from app.services.card_state import VariableInfo
from app.services.turn_plan import TurnContext

CONTEXT = TurnContext(
    1,
    (
        VariableInfo(1, "Temperatura", "°C", True, 0, aliases=("temp",)),
        VariableInfo(2, "Duración", "min", True, 1),
        VariableInfo(3, "Rendimiento", "%", True, 2),
    ),
    None,
    {},
)


class Slow:
    """Answers after `delay` seconds with `outcome`."""

    def __init__(self, name: str, delay: float, outcome: Decision | ProviderFailure) -> None:
        self.name = name
        self._delay = delay
        self._outcome = outcome
        self.cancelled = False

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure:
        try:
            await asyncio.sleep(self._delay)
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        return self._outcome

    async def propose_setup(self, instructions: str) -> SetupDecision | ProviderFailure:
        """The same timing and outcome, as a setup read (spec 0005, AC-33)."""
        outcome = await self.decide(CONTEXT, instructions)
        if isinstance(outcome, ProviderFailure):
            return outcome
        return SetupDecision(ProponerCuaderno(title="Leído"), outcome.provider)


def ok(provider: str) -> Decision:
    return Decision(Confirmar(), provider)


def race(
    primary: LLMProvider, backup: LLMProvider, hedge_s: float, deadline_s: float
) -> FallbackProvider:
    """The capture and setup reads share one race; tests give both the same timings."""
    return FallbackProvider(
        primary,
        backup,
        hedge_s,
        deadline_s,
        setup_hedge_s=hedge_s,
        setup_deadline_s=deadline_s,
    )


def test_ollama_in_time_wins() -> None:
    chain = race(Slow("ollama", 0.01, ok("ollama")), Slow("anthropic", 0, ok("anthropic")), 0.2, 1)
    outcome = asyncio.run(chain.decide(CONTEXT, "sí"))
    assert isinstance(outcome, Decision) and outcome.provider == "ollama"


def test_a_stalled_ollama_lets_claude_answer_first(caplog: pytest.LogCaptureFixture) -> None:
    ollama = Slow("ollama", 5, ok("ollama"))
    chain = race(ollama, Slow("anthropic", 0.01, ok("anthropic")), 0.05, 1)
    with caplog.at_level(logging.WARNING):
        outcome = asyncio.run(chain.decide(CONTEXT, "sí"))
    assert isinstance(outcome, Decision)
    assert (outcome.provider, outcome.fallback_reason) == ("anthropic", "ollama_slow")
    assert ollama.cancelled
    assert any("fallback" in r.message for r in caplog.records)


def test_ollama_failure_starts_claude_at_once() -> None:
    failed = ProviderFailure("ollama", "invalid_output")
    chain = race(Slow("ollama", 0, failed), Slow("anthropic", 0, ok("anthropic")), 1, 2)
    outcome = asyncio.run(chain.decide(CONTEXT, "sí"))
    assert isinstance(outcome, Decision) and outcome.fallback_reason == "ollama_invalid_output"


def test_both_failing_is_a_failure() -> None:
    chain = race(
        Slow("ollama", 0, ProviderFailure("ollama", "error")),
        Slow("anthropic", 0, ProviderFailure("anthropic", "refusal")),
        1,
        2,
    )
    assert isinstance(asyncio.run(chain.decide(CONTEXT, "sí")), ProviderFailure)


def test_the_deadline_ends_the_race() -> None:
    chain = race(Slow("ollama", 5, ok("ollama")), Slow("anthropic", 5, ok("anthropic")), 0.01, 0.05)
    outcome = asyncio.run(chain.decide(CONTEXT, "sí"))
    assert isinstance(outcome, ProviderFailure) and outcome.reason == "deadline"


def test_the_claude_cap_counts_as_a_failure() -> None:
    async def run() -> list[Decision | ProviderFailure]:
        capped = CappedProvider(Slow("anthropic", 0, ok("anthropic")), ClaudeCap(limit=1), "ana")
        return [await capped.decide(CONTEXT, "sí"), await capped.decide(CONTEXT, "sí")]

    first, second = asyncio.run(run())
    assert isinstance(first, Decision)
    assert isinstance(second, ProviderFailure) and second.reason == "claude_cap"


def test_allow_call_slides() -> None:
    allowed, history = allow_call((), 0.0, 1)
    assert allowed
    assert not allow_call(history, 10.0, 1)[0]
    assert allow_call(history, 3601.0, 1)[0]


def test_prod_needs_both_keys_and_refuses_fake() -> None:
    base = {
        "env": "prod",
        "database_url": "postgresql://x",
        "access_codes": "a:b",
        "session_secret": "x" * 32,
        "_env_file": None,
    }
    with pytest.raises(ValidationError):
        Settings(**base, ollama_api_key="k")  # pyright: ignore[reportArgumentType]
    with pytest.raises(ValidationError):
        Settings(**base, ollama_api_key="k", anthropic_api_key="k", llm_provider="fake")  # pyright: ignore[reportArgumentType]
    assert Settings(**base, ollama_api_key="k", anthropic_api_key="k").env == "prod"  # pyright: ignore[reportArgumentType]


def test_fake_rules_read_a_full_sentence() -> None:
    call = read_by_rules(
        CONTEXT, "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento"
    )
    assert isinstance(call, ProponerMedicion)
    assert call.trial_number == 6
    assert [(v.variable_id, v.value) for v in call.values] == [(1, 65), (2, 20), (3, 74)]
    assert read_by_rules(CONTEXT, "sí, guárdalo") == Confirmar()
    assert read_by_rules(CONTEXT, "descártalo") == Descartar()


def test_scripted_fake() -> None:
    fake = FakeProvider([Confirmar(), ProviderFailure("fake", "error")])
    assert isinstance(asyncio.run(fake.decide(CONTEXT, "x")), Decision)
    assert isinstance(asyncio.run(fake.decide(CONTEXT, "x")), ProviderFailure)


def test_claude_tools_are_strict_and_closed() -> None:
    for tool in claude_tools():
        assert tool.get("strict") is True
        schema = tool["input_schema"]
        assert schema.get("additionalProperties") is False  # pyright: ignore[reportAttributeAccessIssue, reportUnknownMemberType]


def test_english_kind_spellings_are_read() -> None:
    assert parse_tool_call("elegir_ensayo", {"kind": "correction"}) == ElegirEnsayo(
        kind="correccion"
    )
    assert parse_tool_call("elegir_ensayo", {"kind": "new"}) == ElegirEnsayo(kind="nuevo")


def test_accented_kind_in_either_unicode_form() -> None:
    import unicodedata

    for form in ("NFC", "NFD"):
        kind = unicodedata.normalize(form, "corrección")
        assert parse_tool_call("elegir_ensayo", {"kind": kind}) == ElegirEnsayo(kind="correccion")


# --- Reading instructions (spec 0005, AC-33): the same race with its own timings ---


def test_a_setup_read_falls_back_to_claude(caplog: pytest.LogCaptureFixture) -> None:
    failed = ProviderFailure("ollama", "invalid_output")
    chain = race(Slow("ollama", 0, failed), Slow("anthropic", 0, ok("anthropic")), 1, 2)
    with caplog.at_level(logging.WARNING):
        outcome = asyncio.run(chain.propose_setup("Mida la temperatura."))
    assert isinstance(outcome, SetupDecision)
    assert (outcome.provider, outcome.fallback_reason) == ("anthropic", "ollama_invalid_output")
    assert any("fallback" in r.message for r in caplog.records)


def test_setup_reads_use_their_own_timings() -> None:
    chain = FallbackProvider(
        Slow("ollama", 0.1, ok("ollama")),
        Slow("anthropic", 5, ok("anthropic")),
        0.01,
        0.05,  # capture would hit its deadline first
        setup_hedge_s=1,
        setup_deadline_s=2,
    )
    outcome = asyncio.run(chain.propose_setup("Mida la temperatura."))
    assert isinstance(outcome, SetupDecision) and outcome.provider == "ollama"
    capture = asyncio.run(chain.decide(CONTEXT, "sí"))
    assert isinstance(capture, ProviderFailure) and capture.reason == "deadline"


def test_a_setup_read_takes_from_the_claude_cap() -> None:
    async def run() -> list[Decision | SetupDecision | ProviderFailure]:
        capped = CappedProvider(Slow("anthropic", 0, ok("anthropic")), ClaudeCap(limit=1), "ana")
        return [await capped.propose_setup("texto"), await capped.decide(CONTEXT, "sí")]

    first, second = asyncio.run(run())
    assert isinstance(first, SetupDecision)
    assert isinstance(second, ProviderFailure) and second.reason == "claude_cap"


def test_the_setup_hedge_must_be_below_the_deadline() -> None:
    base = {
        "env": "dev",
        "database_url": "postgresql://x",
        "access_codes": "a:b",
        "session_secret": "x" * 32,
        "_env_file": None,
    }
    with pytest.raises(ValidationError, match="SETUP_HEDGE_S"):
        Settings(**base, setup_hedge_s=45, setup_deadline_s=45)  # pyright: ignore[reportArgumentType]
    assert Settings(**base).setup_deadline_s == 45  # pyright: ignore[reportArgumentType]


def test_the_fake_reads_a_handout_by_rules() -> None:
    text = "Práctica 3\nMida la temperatura (entre 40 y 80 °C) y el rendimiento en %."
    outcome = asyncio.run(FakeProvider().propose_setup(text))
    assert isinstance(outcome, SetupDecision)
    temperatura = next(v for v in outcome.call.variables if v.name == "Temperatura")
    assert (temperatura.min_value, temperatura.max_value) == (40, 80)
    assert temperatura.range_quote == "entre 40 y 80 °C"


def test_the_setup_tool_is_strict_and_closed_for_claude() -> None:
    from app.ai.providers.anthropic import setup_tool_definition

    tool = setup_tool_definition()
    schema = tool["input_schema"]
    assert tool.get("strict") is True
    assert schema.get("additionalProperties") is False
    assert set(schema.get("required", [])) == {
        "title",
        "goal",
        "context",
        "found_count",
        "variables",
    }


def test_a_setup_call_over_30_variables_is_cut_not_refused() -> None:
    from app.ai.tools import parse_setup_call

    variables = [{"name": f"V{i}"} for i in range(40)]
    call = parse_setup_call("proponer_cuaderno", {"title": "T", "variables": variables})
    assert len(call.variables) == 30


def test_another_tool_is_not_a_setup_call() -> None:
    from app.ai.tools import parse_setup_call

    with pytest.raises(ValueError, match="unexpected tool"):
        parse_setup_call("confirmar", {})
