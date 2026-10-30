"""When a spoken sentence means "take back the last save" (spec 0007, AC-7). Pure."""

import re

from app.services.text import fold

_UNDO = re.compile(r"\b(deshacer|deshazlo|deshaz|(quita|borra) el ultimo)\b")


def match_undo(text: str) -> bool:
    """Whole words of the folded sentence: "deshacer", "deshazlo", "quita el último",
    "borra el último". Matched by code before the model is called."""
    return _UNDO.search(fold(text)) is not None
