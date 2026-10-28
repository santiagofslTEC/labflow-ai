"""Text folding shared by number reading and units (spec 0006). Pure."""

import unicodedata
from collections.abc import Sequence


def _fold_char(char: str) -> str:
    base = unicodedata.normalize("NFD", char)[0]
    return base.lower()[0]


def fold(text: str) -> str:
    """Lowercase without accents, one character per character, so every index in the folded
    text points at the same character in the original."""
    return "".join(_fold_char(char) for char in text)


def format_number(value: float) -> str:
    """Comma decimal, no thousands grouping, up to 6 decimals: 73.5 → "73,5", 120.0 → "120"."""
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return "0" if text in {"-0", ""} else text.replace(".", ",")


def join_names(names: Sequence[str]) -> str:
    """Names joined as "a", "a y b", or "a, b y c"."""
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} y {names[-1]}"
