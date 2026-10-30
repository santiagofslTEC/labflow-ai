"""Measure a voice turn without a mic (spec 0007, AC-25): sign in, open a voice session on a
notebook, send one sentence as a typed `user_message` over the agent WebSocket, and print how
long the first agent audio and the agent's reply took.

    LABFLOW_ACCESS_CODE=... uv run python scripts/voice_probe.py --env prod --experiment 865 \
        "Hola, ¿me escuchas?"

Use a scratch notebook. In prod a sentence that could save (any digit or number word) is refused
unless `--allow-writes` is passed.
"""

import argparse
import asyncio
import json
import os
import re
import ssl
import sys
import time
import unicodedata
from typing import cast

import certifi
import httpx
import websockets

API_URLS = {
    "dev": "http://localhost:8000",
    "prod": "https://labflow-ai-production.up.railway.app",
}
WAIT_S = 20.0
GREETING_WAIT_S = 1.0
NUMBER_WORDS = frozenset(
    [
        "cero",
        "uno",
        "una",
        "dos",
        "tres",
        "cuatro",
        "cinco",
        "seis",
        "siete",
        "ocho",
        "nueve",
        "diez",
        "once",
        "doce",
        "trece",
        "catorce",
        "quince",
        "veinte",
        "treinta",
        "cuarenta",
        "cincuenta",
        "sesenta",
        "setenta",
        "ochenta",
        "noventa",
        "cien",
        "ciento",
        "mil",
    ]
)
# Compound number words ("veintitrés", "dieciséis", "doscientos"): a false refusal is fine.
NUMBER_STEMS = (
    "veint",
    "dieci",
    "treint",
    "cuarent",
    "cincuent",
    "sesent",
    "setent",
    "ochent",
    "novent",
    "cient",
    "dosc",
    "tresc",
    "cuatroc",
    "quinient",
    "seisc",
    "setec",
    "ochoc",
    "novec",
)


def could_save(sentence: str) -> bool:
    """Whether a capture turn might write rows: it holds a digit or a Spanish number word."""
    folded = unicodedata.normalize("NFKD", sentence.lower())
    words = set(re.findall(r"[a-z]+", folded))
    numbers = words & NUMBER_WORDS or {w for w in words if w.startswith(NUMBER_STEMS)}
    return bool(re.search(r"\d", sentence)) or bool(numbers)


def _args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("sentence")
    parser.add_argument("--env", choices=sorted(API_URLS), default="dev")
    parser.add_argument("--experiment", type=int, required=True, help="a scratch notebook id")
    parser.add_argument("--allow-writes", action="store_true")
    return parser.parse_args()


async def _probe(api: str, code: str, experiment: int, sentence: str) -> None:
    async with httpx.AsyncClient(base_url=api, timeout=20) as http:
        access = await http.post("/api/access", json={"code": code})
        if access.status_code != 200:
            sys.exit(f"access refused ({access.status_code})")
        opened = await http.post("/api/voice/session", json={"experiment_id": experiment})
        if opened.status_code != 200:
            sys.exit(f"voice session refused ({opened.status_code}): {opened.text}")
        session = cast(dict[str, str], opened.json())
        try:
            await _talk(session["signed_url"], session["session_token"], sentence)
        finally:
            await http.delete(f"/api/voice/session/{session['sid']}")


async def _talk(signed_url: str, token: str, sentence: str) -> None:
    tls = ssl.create_default_context(cafile=certifi.where())
    async with websockets.connect(signed_url, max_size=None, ssl=tls) as ws:
        await ws.send(
            json.dumps(
                {
                    "type": "conversation_initiation_client_data",
                    "custom_llm_extra_body": {"session_token": token},
                }
            )
        )
        sent_at: float | None = None
        first_audio: float | None = None
        greeted = False
        deadline = time.monotonic() + WAIT_S
        while time.monotonic() < deadline:
            event = cast(dict[str, object], json.loads(await asyncio.wait_for(ws.recv(), WAIT_S)))
            kind = event.get("type")
            if kind == "ping":
                ping = cast(dict[str, object], event["ping_event"])
                await ws.send(json.dumps({"type": "pong", "event_id": ping["event_id"]}))
            elif kind == "agent_response" and not greeted:
                greeted = True
                await asyncio.sleep(GREETING_WAIT_S)
                await ws.send(json.dumps({"type": "user_message", "text": sentence}))
                sent_at = time.monotonic()
            elif kind == "audio" and sent_at is not None and first_audio is None:
                first_audio = time.monotonic() - sent_at
                print(f"first audio  {first_audio:5.2f} s")
            elif kind == "agent_response" and sent_at is not None:
                body = cast(dict[str, str], event["agent_response_event"])
                print(f"agent reply  {time.monotonic() - sent_at:5.2f} s  {body['agent_response']}")
                return
        print("no reply within the wait")


def main() -> None:
    args = _args()
    code = os.environ.get("LABFLOW_ACCESS_CODE")
    if not code:
        sys.exit("set LABFLOW_ACCESS_CODE")
    if args.env == "prod" and could_save(args.sentence) and not args.allow_writes:
        sys.exit("this sentence could save in prod; pass --allow-writes on a scratch notebook")
    asyncio.run(_probe(API_URLS[args.env], code, args.experiment, args.sentence))


if __name__ == "__main__":
    main()
