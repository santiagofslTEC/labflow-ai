"""Builds the provider chain for a request from `LLM_PROVIDER` and the keys present
(spec 0006, `get_provider`). The SDK clients and the Claude cap live in `app.state`."""

from dataclasses import dataclass
from typing import Annotated, cast

import anthropic
import ollama
from fastapi import Depends, Request

from app.ai.claude_cap import CappedProvider, ClaudeCap
from app.ai.provider import LLMProvider
from app.ai.providers.anthropic import AnthropicProvider
from app.ai.providers.fake import FakeProvider
from app.ai.providers.fallback import FallbackProvider
from app.ai.providers.ollama import OllamaProvider
from app.core.gate import HolderDep
from app.core.settings import Settings, get_settings


@dataclass(frozen=True)
class LLMClients:
    ollama: ollama.AsyncClient | None
    anthropic: anthropic.AsyncAnthropic | None
    claude_cap: ClaudeCap


def make_clients(settings: Settings) -> LLMClients:
    """Called once in the lifespan. A missing key skips that provider (dev only)."""
    return LLMClients(
        ollama=ollama.AsyncClient(
            host=settings.ollama_host,
            headers={"Authorization": f"Bearer {settings.ollama_api_key}"},
        )
        if settings.ollama_api_key
        else None,
        anthropic=anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        if settings.anthropic_api_key
        else None,
        claude_cap=ClaudeCap(limit=settings.claude_max_calls_per_hour),
    )


def build_provider(settings: Settings, clients: LLMClients, holder: str) -> LLMProvider | None:
    """None when no provider can run (dev with no keys): the route answers 503."""
    if settings.llm_provider == "fake":
        return FakeProvider()
    primary = OllamaProvider(clients.ollama, settings.ollama_model) if clients.ollama else None
    backup = (
        CappedProvider(
            AnthropicProvider(
                clients.anthropic,
                settings.anthropic_model,
                settings.claude_timeout_s,
                setup_timeout_s=settings.setup_claude_timeout_s,
                setup_max_tokens=settings.setup_max_tokens,
            ),
            clients.claude_cap,
            holder,
        )
        if clients.anthropic
        else None
    )
    match settings.llm_provider:
        case "ollama":
            return primary
        case "anthropic":
            return backup
        case "fallback":
            if primary and backup:
                return FallbackProvider(
                    primary,
                    backup,
                    settings.ollama_hedge_s,
                    settings.llm_deadline_s,
                    setup_hedge_s=settings.setup_hedge_s,
                    setup_deadline_s=settings.setup_deadline_s,
                )
            return primary or backup


def get_provider(request: Request, holder: HolderDep) -> LLMProvider | None:
    clients = cast(LLMClients, request.app.state.llm_clients)
    return build_provider(get_settings(), clients, holder)


ProviderDep = Annotated[LLMProvider | None, Depends(get_provider)]
