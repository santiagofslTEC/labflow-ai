"""Create or update this environment's ElevenLabs agent from `api/voice/agent.json`
(spec 0007, AC-16). Running it twice changes nothing new.

    uv run python scripts/sync_agent.py --env dev [--show]

Reads ELEVENLABS_API_KEY, VOICE_LLM_SECRET, VOICE_LLM_URL, and ELEVENLABS_AGENT_ID (when the
agent exists) from api/.env. Prints the agent id to put in ELEVENLABS_AGENT_ID. `--show`
prints the stored agent's privacy, turn, and tool settings, to confirm the setting names.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import cast

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

import httpx  # noqa: E402

from app.core.settings import get_settings  # noqa: E402
from app.voice import elevenlabs  # noqa: E402
from app.voice.agent_config import (  # noqa: E402
    Env,
    build_payload,
    load_template,
    prod_url_problem,
    secret_name,
)


def _show(agent: dict[str, object]) -> None:
    conversation = cast(dict[str, dict[str, object]], agent.get("conversation_config", {}))
    platform = cast(dict[str, object], agent.get("platform_settings", {}))
    prompt = cast(dict[str, object], conversation.get("agent", {}).get("prompt", {}))
    shown = {
        "custom_llm": prompt.get("custom_llm"),
        "built_in_tools": prompt.get("built_in_tools"),
        "turn": conversation.get("turn"),
        "conversation": conversation.get("conversation"),
        "privacy": platform.get("privacy"),
        "overrides": platform.get("overrides"),
        "auth": platform.get("auth"),
    }
    print(json.dumps(shown, indent=2, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", choices=("dev", "prod"), required=True)
    parser.add_argument("--show", action="store_true")
    args = parser.parse_args()
    env = cast(Env, args.env)

    settings = get_settings()
    missing = [
        name
        for name, value in (
            ("ELEVENLABS_API_KEY", settings.elevenlabs_api_key),
            ("VOICE_LLM_SECRET", settings.voice_llm_secret),
            ("VOICE_LLM_URL", settings.voice_llm_url),
        )
        if not value
    ]
    if missing:
        print(f"Missing in api/.env: {', '.join(missing)}", file=sys.stderr)
        return 1
    api_key = cast(str, settings.elevenlabs_api_key)
    llm_url = cast(str, settings.voice_llm_url)
    if problem := prod_url_problem(env, llm_url, os.environ.get("RAILWAY_PUBLIC_DOMAIN")):
        print(problem, file=sys.stderr)
        return 1

    with httpx.Client(timeout=elevenlabs.TIMEOUT_S) as client:
        # Secrets cannot be updated through the API, so an existing one is reused as is.
        # After changing VOICE_LLM_SECRET, delete the secret in the dashboard and run again.
        name = secret_name(env)
        secret_id = elevenlabs.find_secret(client, api_key, name)
        if secret_id is None:
            secret_id = elevenlabs.create_secret(
                client, api_key, name, cast(str, settings.voice_llm_secret)
            )
            print(f"Created secret {name}")

        payload = build_payload(load_template(), env, llm_url, secret_id)
        agent_id = settings.elevenlabs_agent_id
        existing = elevenlabs.get_agent(client, api_key, agent_id) if agent_id else None
        if agent_id and existing is not None:
            elevenlabs.update_agent(client, api_key, agent_id, payload)
            print(f"Updated agent {agent_id}")
        else:
            agent_id = elevenlabs.create_agent(client, api_key, payload)
            print(f"Created agent {agent_id}. Set ELEVENLABS_AGENT_ID={agent_id} in api/.env")

        if args.show:
            stored = elevenlabs.get_agent(client, api_key, agent_id)
            if stored is not None:
                _show(stored)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
