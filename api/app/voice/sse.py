"""OpenAI compatible chat completion chunks (spec 0007, AC-4). Pure string building."""

import json

MODEL = "labflow-capture"
DONE = "data: [DONE]\n\n"


def chunk(completion_id: str, created: int, text: str, finish: bool = False) -> str:
    """One server sent event holding a delta of the reply (or the final stop chunk)."""
    delta: dict[str, str] = {} if finish else {"role": "assistant", "content": text}
    body = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": MODEL,
        "choices": [{"index": 0, "delta": delta, "finish_reason": "stop" if finish else None}],
    }
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


def completion(completion_id: str, created: int, text: str) -> dict[str, object]:
    """The single answer for a `stream: false` request."""
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": MODEL,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }
        ],
    }


def last_user_text(messages: object) -> str | None:
    """The stripped text of the last `role: user` message (AC-3), or None."""
    if not isinstance(messages, list):
        return None
    for message in reversed(messages):  # pyright: ignore[reportUnknownArgumentType, reportUnknownVariableType]
        if isinstance(message, dict) and message.get("role") == "user":  # pyright: ignore[reportUnknownMemberType]
            content: object = message.get("content")  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
            return content.strip() if isinstance(content, str) else None
    return None
