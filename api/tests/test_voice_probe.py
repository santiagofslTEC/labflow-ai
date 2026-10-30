"""Spec 0007 build task 1: the pure voice pieces and the Custom LLM guard."""

import json

from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.voice import sse
from app.voice.agent_config import LLM_PATH, build_payload, load_template
from app.voice.session import VoiceClaims, read_voice_token, sign_voice_token

SECRET = "x" * 40
CLAIMS = VoiceClaims(sid="abc", holder="dev", experiment_id=3)


def test_token_round_trips() -> None:
    assert read_voice_token(SECRET, sign_voice_token(SECRET, CLAIMS)) == CLAIMS


def test_token_signed_with_another_secret_is_refused() -> None:
    assert read_voice_token(SECRET, sign_voice_token("y" * 40, CLAIMS)) is None
    assert read_voice_token(SECRET, "not-a-token") is None


def test_last_user_text_skips_assistant_and_system() -> None:
    messages = [
        {"role": "system", "content": "x"},
        {"role": "assistant", "content": "Te escucho. Dicta el ensayo."},
        {"role": "user", "content": "  Ensayo 7, sesenta y cinco grados "},
        {"role": "assistant", "content": "later"},
    ]
    assert sse.last_user_text(messages) == "Ensayo 7, sesenta y cinco grados"
    assert sse.last_user_text([{"role": "assistant", "content": "x"}]) is None
    assert sse.last_user_text("nope") is None


def test_chunk_is_an_openai_delta() -> None:
    event = sse.chunk("id1", 1, "Guardado ensayo 7")
    assert event.startswith("data: ") and event.endswith("\n\n")
    body = json.loads(event.removeprefix("data: "))
    assert body["choices"][0]["delta"] == {"role": "assistant", "content": "Guardado ensayo 7"}
    final = json.loads(sse.chunk("id1", 1, "", finish=True).removeprefix("data: "))
    assert final["choices"][0] == {"index": 0, "delta": {}, "finish_reason": "stop"}


def test_payload_fills_url_and_secret_without_touching_the_template() -> None:
    template = load_template()
    payload = build_payload(template, "dev", "https://tunnel.example/", "sec_1")
    custom = payload["conversation_config"]["agent"]["prompt"]["custom_llm"]  # type: ignore[index]
    assert custom["url"] == "https://tunnel.example" + LLM_PATH  # type: ignore[index]
    assert custom["api_key"] == {"secret_id": "sec_1"}  # type: ignore[index]
    assert payload["name"] == "LabFlow captura (dev)"
    assert "url" not in template["conversation_config"]["agent"]["prompt"]["custom_llm"]  # type: ignore[index]
    assert "built_in_tools" not in payload["conversation_config"]["agent"]["prompt"]  # type: ignore[index]


def test_custom_llm_without_bearer_is_401(client: TestClient) -> None:
    response = client.post("/api/voice/llm/chat/completions", json={"messages": []})
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_voice_session_needs_the_access_cookie(client: TestClient) -> None:
    response = client.post("/api/voice/session", json={"experiment_id": 1})
    assert response.status_code == 401


def test_custom_llm_with_bearer_and_token_streams_what_it_heard(client: TestClient) -> None:
    settings = get_settings()
    if not settings.voice_llm_secret:
        return  # VOICE_LLM_SECRET not set in api/.env yet
    token = sign_voice_token(settings.session_secret, CLAIMS)
    response = client.post(
        "/api/voice/llm/chat/completions",
        headers={"Authorization": f"Bearer {settings.voice_llm_secret}"},
        json={
            "messages": [{"role": "user", "content": "ensayo uno"}],
            "stream": True,
            "elevenlabs_extra_body": {"session_token": token},
        },
    )
    assert response.status_code == 200
    assert "Te oí: ensayo uno" in response.text
    assert response.text.endswith(sse.DONE)
