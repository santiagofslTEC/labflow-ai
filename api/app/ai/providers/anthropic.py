"""Claude adapter (spec 0006): strict tools, `tool_choice` auto, adaptive thinking at low
effort (set explicitly; Haiku 5.5 defaults to medium). A refusal counts as a failure."""

from collections.abc import Mapping

import anthropic
from anthropic.types import ToolParam
from pydantic import ValidationError

from app.ai.prompt import setup_prompt, system_prompt
from app.ai.provider import Decision, ProviderFailure, SetupDecision
from app.ai.tools import (
    SETUP_TOOL_DESCRIPTION,
    SETUP_TOOL_NAME,
    TOOLS,
    ProponerCuaderno,
    arguments_schema,
    model_schema,
    parse_setup_call,
    parse_tool_call,
)
from app.services.turn_plan import TurnContext

# Keys strict tools refuse; code enforces them after parsing instead.
_UNSUPPORTED = frozenset({"maxItems"})


def _strict(schema: Mapping[str, object]) -> dict[str, object]:
    """Strict tools need every object closed and every property listed as required."""
    out: dict[str, object] = {}
    for key, value in schema.items():
        if key in _UNSUPPORTED:
            continue
        if isinstance(value, Mapping):
            out[key] = _strict(value)  # pyright: ignore[reportUnknownArgumentType]
        elif isinstance(value, list):
            out[key] = [
                _strict(v) if isinstance(v, Mapping) else v  # pyright: ignore[reportUnknownArgumentType]
                for v in value  # pyright: ignore[reportUnknownVariableType]
            ]
        else:
            out[key] = value
    if out.get("type") == "object":
        out["additionalProperties"] = False
        properties = out.get("properties")
        if isinstance(properties, Mapping):
            out["required"] = list(properties)  # pyright: ignore[reportUnknownArgumentType]
    return out


def tool_definitions() -> list[ToolParam]:
    return [
        {
            "name": name,
            "description": description,
            "input_schema": _strict(arguments_schema(name)),  # pyright: ignore[reportArgumentType]
            "strict": True,
        }
        for name, (_, description) in TOOLS.items()
    ]


def setup_tool_definition() -> ToolParam:
    return {
        "name": SETUP_TOOL_NAME,
        "description": SETUP_TOOL_DESCRIPTION,
        "input_schema": _strict(model_schema(ProponerCuaderno)),  # pyright: ignore[reportArgumentType]
        "strict": True,
    }


class AnthropicProvider:
    name = "anthropic"

    def __init__(
        self,
        client: anthropic.AsyncAnthropic,
        model: str,
        timeout_s: float,
        *,
        setup_timeout_s: float,
        setup_max_tokens: int,
    ) -> None:
        self._client = client
        self._model = model
        self._timeout_s = timeout_s
        self._setup_timeout_s = setup_timeout_s
        self._setup_max_tokens = setup_max_tokens

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure:
        try:
            message = await self._client.with_options(
                timeout=self._timeout_s, max_retries=0
            ).messages.create(
                model=self._model,
                max_tokens=2048,
                system=system_prompt(context),
                messages=[{"role": "user", "content": utterance}],
                tools=tool_definitions(),
                tool_choice={"type": "auto"},
                output_config={"effort": "low"},
            )
        except anthropic.APITimeoutError:
            return ProviderFailure(self.name, "timeout")
        except anthropic.APIError as exc:
            return ProviderFailure(self.name, "error", type(exc).__name__)
        if message.stop_reason == "refusal":
            return ProviderFailure(self.name, "refusal")
        uses = [block for block in message.content if block.type == "tool_use"]
        if not uses:
            return ProviderFailure(self.name, "invalid_output", "no tool call")
        block = uses[0]
        try:
            arguments = {str(k): v for k, v in dict(block.input).items()}  # pyright: ignore[reportUnknownArgumentType, reportUnknownVariableType]
            call = parse_tool_call(block.name, arguments)
        except (ValidationError, TypeError, ValueError) as exc:
            return ProviderFailure(self.name, "invalid_output", type(exc).__name__)
        return Decision(call=call, provider=self.name)

    async def propose_setup(self, instructions: str) -> SetupDecision | ProviderFailure:
        try:
            message = await self._client.with_options(
                timeout=self._setup_timeout_s, max_retries=0
            ).messages.create(
                model=self._model,
                max_tokens=self._setup_max_tokens,
                messages=[{"role": "user", "content": setup_prompt(instructions)}],
                tools=[setup_tool_definition()],
                tool_choice={"type": "auto"},
                output_config={"effort": "low"},
            )
        except anthropic.APITimeoutError:
            return ProviderFailure(self.name, "timeout")
        except anthropic.APIError as exc:
            return ProviderFailure(self.name, "error", type(exc).__name__)
        if message.stop_reason == "refusal":
            return ProviderFailure(self.name, "refusal")
        uses = [block for block in message.content if block.type == "tool_use"]
        if not uses:
            return ProviderFailure(self.name, "invalid_output", "no tool call")
        block = uses[0]
        try:
            arguments = {str(k): v for k, v in dict(block.input).items()}  # pyright: ignore[reportUnknownArgumentType, reportUnknownVariableType]
            call = parse_setup_call(block.name, arguments)
        except (ValidationError, TypeError, ValueError) as exc:
            return ProviderFailure(self.name, "invalid_output", type(exc).__name__)
        return SetupDecision(call=call, provider=self.name)
