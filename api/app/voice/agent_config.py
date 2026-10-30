"""The ElevenLabs agent payload (spec 0007, AC-16). Pure: `api/voice/agent.json` plus the
values that differ per environment, never read from the env here."""

import copy
import json
from pathlib import Path
from typing import Literal, cast
from urllib.parse import urlparse

AGENT_FILE = Path(__file__).resolve().parents[2] / "voice" / "agent.json"
# The agent's Custom LLM base URL: ElevenLabs appends `/chat/completions` itself (task 1).
LLM_PATH = "/api/voice/llm"

Env = Literal["dev", "prod"]
Payload = dict[str, object]


def load_template(path: Path = AGENT_FILE) -> Payload:
    return cast(Payload, json.loads(path.read_text(encoding="utf-8")))


def secret_name(env: Env) -> str:
    return f"labflow-voice-llm-{env}"


def agent_name(template: Payload, env: Env) -> str:
    return f"{template['name']} ({env})"


def build_payload(template: Payload, env: Env, llm_base_url: str, secret_id: str) -> Payload:
    """A new payload with this environment's name, Custom LLM URL, and secret filled in."""
    payload = copy.deepcopy(template)
    payload["name"] = agent_name(template, env)
    conversation = cast(dict[str, dict[str, object]], payload["conversation_config"])
    prompt = cast(dict[str, object], conversation["agent"]["prompt"])
    custom_llm = cast(dict[str, object], prompt["custom_llm"])
    custom_llm["url"] = llm_base_url.rstrip("/") + LLM_PATH
    custom_llm["api_key"] = {"secret_id": secret_id}
    return payload


def prod_url_problem(env: Env, llm_base_url: str, public_domain: str | None) -> str | None:
    """Why this URL must not go on the prod agent, or None. Prod syncs run under `railway run`,
    which sets RAILWAY_PUBLIC_DOMAIN; the URL must be that host over https, so a dev tunnel
    left in api/.env never reaches the prod agent."""
    if env != "prod":
        return None
    if not public_domain:
        return "Run the prod sync with `railway run` so the URL can be checked."
    parsed = urlparse(llm_base_url)
    if parsed.scheme != "https" or parsed.hostname != public_domain:
        return f"VOICE_LLM_URL points at {parsed.hostname}, not https://{public_domain}."
    return None
