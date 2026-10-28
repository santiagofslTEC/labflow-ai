"""Ollama Cloud adapter (spec 0006). Tools are passed as functions; the call is validated
with Pydantic. Any failure comes back as a `ProviderFailure`, never an exception."""

import json
import logging
from collections.abc import Mapping
from typing import cast

import httpx
import ollama
from pydantic import ValidationError

from app.ai.prompt import system_prompt
from app.ai.provider import Decision, ProviderFailure
from app.ai.tools import TOOLS, arguments_schema, parse_tool_call
from app.services.numbers import parse_number
from app.services.turn_plan import TurnContext

logger = logging.getLogger(__name__)


def tool_definitions() -> list[dict[str, object]]:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": arguments_schema(name),
            },
        }
        for name, (_, description) in TOOLS.items()
    ]


def _arguments(raw: object) -> Mapping[str, object]:
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, Mapping):
        raise TypeError("tool arguments are not an object")
    return {str(k): v for k, v in cast(Mapping[object, object], raw).items()}


def _read_value(value: dict[str, object]) -> dict[str, object]:
    """gpt-oss sometimes sends `value` as words ("setenta y cuatro"); read it in code.
    Grounding still checks it against the sentence, so nothing new can slip in."""
    raw = value.get("value")
    if isinstance(raw, str):
        number = parse_number(raw)
        return {**value, "value": raw if number is None else number}
    return value


def _with_read_values(arguments: Mapping[str, object]) -> Mapping[str, object]:
    values = arguments.get("values")
    if not isinstance(values, list):
        return arguments
    read = [
        _read_value(cast(dict[str, object], v)) if isinstance(v, dict) else v
        for v in cast(list[object], values)
    ]
    return {**arguments, "values": read}


class OllamaProvider:
    name = "ollama"

    def __init__(self, client: ollama.AsyncClient, model: str) -> None:
        self._client = client
        self._model = model

    async def decide(self, context: TurnContext, utterance: str) -> Decision | ProviderFailure:
        try:
            response = await self._client.chat(  # pyright: ignore[reportUnknownMemberType]
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt(context)},
                    {"role": "user", "content": utterance},
                ],
                tools=tool_definitions(),
                think="low",
                options={"temperature": 0},
            )
        except (ollama.ResponseError, httpx.HTTPError) as exc:
            return ProviderFailure(self.name, "error", type(exc).__name__)
        calls = response.message.tool_calls or []
        if not calls:
            return ProviderFailure(self.name, "invalid_output", "no tool call")
        first = calls[0].function
        try:
            call = parse_tool_call(first.name, _with_read_values(_arguments(first.arguments)))
        except (ValidationError, ValueError, TypeError) as exc:
            return ProviderFailure(self.name, "invalid_output", type(exc).__name__)
        return Decision(call=call, provider=self.name)
