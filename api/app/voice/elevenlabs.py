"""ElevenLabs REST calls (spec 0007): the signed URL for a session, and the agent and secret
writes behind `scripts/sync_agent.py`. All I/O; callers pass the client and the key."""

import logging
from typing import cast

import httpx

from app.voice.agent_config import Payload

BASE_URL = "https://api.elevenlabs.io"
TIMEOUT_S = 10.0

log = logging.getLogger(__name__)


def _headers(api_key: str) -> dict[str, str]:
    return {"xi-api-key": api_key}


async def get_signed_url(client: httpx.AsyncClient, api_key: str, agent_id: str) -> str | None:
    """A signed URL for one conversation with the private agent, or None when ElevenLabs
    refuses or cannot be reached (the route answers 503 voice_unavailable)."""
    try:
        response = await client.get(
            f"{BASE_URL}/v1/convai/conversation/get-signed-url",
            params={"agent_id": agent_id},
            headers=_headers(api_key),
            timeout=TIMEOUT_S,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        log.warning("elevenlabs signed url failed: %s", type(error).__name__)
        return None
    url: object = response.json().get("signed_url")
    return url if isinstance(url, str) else None


def find_secret(client: httpx.Client, api_key: str, name: str) -> str | None:
    response = client.get(f"{BASE_URL}/v1/convai/secrets", headers=_headers(api_key))
    response.raise_for_status()
    secrets = cast(list[dict[str, object]], response.json().get("secrets", []))
    ids = [s["secret_id"] for s in secrets if s.get("name") == name]
    return str(ids[0]) if ids else None


def create_secret(client: httpx.Client, api_key: str, name: str, value: str) -> str:
    response = client.post(
        f"{BASE_URL}/v1/convai/secrets",
        headers=_headers(api_key),
        json={"type": "new", "name": name, "value": value},
    )
    response.raise_for_status()
    return str(response.json()["secret_id"])


def get_agent(client: httpx.Client, api_key: str, agent_id: str) -> Payload | None:
    response = client.get(f"{BASE_URL}/v1/convai/agents/{agent_id}", headers=_headers(api_key))
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return cast(Payload, response.json())


def create_agent(client: httpx.Client, api_key: str, payload: Payload) -> str:
    response = client.post(
        f"{BASE_URL}/v1/convai/agents/create", headers=_headers(api_key), json=payload
    )
    response.raise_for_status()
    return str(response.json()["agent_id"])


def update_agent(client: httpx.Client, api_key: str, agent_id: str, payload: Payload) -> None:
    response = client.patch(
        f"{BASE_URL}/v1/convai/agents/{agent_id}", headers=_headers(api_key), json=payload
    )
    response.raise_for_status()
