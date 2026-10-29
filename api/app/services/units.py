"""Units (spec 0006, RN-01): synonyms to a canonical unit and the known conversions. Pure.

Unit words match whole tokens after folding, so a lone `C` or `s` never matches inside a word.
A variable whose own unit is not in the table accepts only its exact unit text, or none.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from types import MappingProxyType

from app.services.text import fold

_SYNONYMS: Mapping[str, tuple[str, ...]] = MappingProxyType(
    {
        "°C": (
            "grados celsius",
            "grados centigrados",
            "grados",
            "centigrados",
            "°c",
            "ºc",
            "c",
        ),
        "K": ("kelvin", "k"),
        "°F": ("grados fahrenheit", "°f", "ºf"),
        "%": ("por ciento", "porciento", "%"),
        "min": ("minutos", "minuto", "min"),
        "h": ("horas", "hora", "h"),
        "s": ("segundos", "segundo", "s"),
    }
)

# Folded synonym → canonical unit, longest first so "grados fahrenheit" beats "grados".
_BY_WORDS: tuple[tuple[str, str], ...] = tuple(
    sorted(
        ((word, unit) for unit, words in _SYNONYMS.items() for word in words),
        key=lambda pair: -len(pair[0]),
    )
)

_CONVERSIONS: Mapping[tuple[str, str], Callable[[float], float]] = MappingProxyType(
    {
        ("K", "°C"): lambda x: x - 273.15,
        ("°C", "K"): lambda x: x + 273.15,
        ("°F", "°C"): lambda x: (x - 32) * 5 / 9,
        ("°C", "°F"): lambda x: x * 9 / 5 + 32,
        ("h", "min"): lambda x: x * 60,
        ("min", "h"): lambda x: x / 60,
        ("s", "min"): lambda x: x / 60,
        ("min", "s"): lambda x: x * 60,
        ("h", "s"): lambda x: x * 3600,
        ("s", "h"): lambda x: x / 3600,
    }
)


@dataclass(frozen=True, slots=True)
class UnknownUnit:
    """The said unit is not in the table, or has no conversion to the variable's unit."""


@dataclass(frozen=True, slots=True)
class UnitMatch:
    end: int  # index just past the unit words in the original text
    unit: str  # canonical, or the variable's own unit text when it is not in the table


def canonical(unit: str) -> str:
    """The table's name for a unit text ("ºC" → "°C"); a unit outside the table stays as is."""
    folded = fold(unit.strip())
    return next((name for word, name in _BY_WORDS if word == folded), unit.strip())


def is_known_unit(unit: str) -> bool:
    """Whether `canonical` finds the text in its table (spec 0005, AC-25 step 5)."""
    folded = fold(unit.strip())
    return any(word == folded for word, _ in _BY_WORDS)


def _words(own_unit: str | None) -> tuple[tuple[str, str], ...]:
    """The table's words plus the variable's own unit text, when the table does not know it."""
    own = own_unit.strip() if own_unit is not None else ""
    if not own or any(word == fold(own) for word, _ in _BY_WORDS):
        return _BY_WORDS
    return tuple(sorted((*_BY_WORDS, (fold(own), own)), key=lambda pair: -len(pair[0])))


def _is_word_char(char: str) -> bool:
    return char.isalnum() or char == "_"


def match_unit_at(text: str, start: int, own_unit: str | None = None) -> UnitMatch | None:
    """The longest unit synonym that begins at `start` after spaces only, as a whole token."""
    folded = fold(text)
    position = start
    while position < len(folded) and folded[position] == " ":
        position += 1
    for word, unit in _words(own_unit):
        end = position + len(word)
        if folded.startswith(word, position) and (
            end == len(folded) or not _is_word_char(folded[end]) or not _is_word_char(word[-1])
        ):
            return UnitMatch(end=end, unit=unit)
    return None


def split_unit(said_text: str, own_unit: str | None = None) -> tuple[str, str | None]:
    """`said_text` split into its number words and the canonical unit at its end, if any."""
    folded = fold(said_text.rstrip())
    for word, unit in _words(own_unit):
        if not folded.endswith(word):
            continue
        cut = len(folded) - len(word)
        if cut == 0 or not _is_word_char(word[0]) or not folded[cut - 1].isalpha():
            return said_text[:cut].rstrip(), unit
    return said_text, None


def normalize(
    value: float, said_unit: str | None, variable_unit: str | None
) -> float | UnknownUnit:
    """`value` in the variable's unit. No unit said means the variable's unit already."""
    if said_unit is None:
        return value
    if variable_unit is None:
        return UnknownUnit()  # a unitless variable takes the number only when no unit is said
    target = canonical(variable_unit)
    if said_unit == target:
        return value
    convert = _CONVERSIONS.get((said_unit, target))
    if convert is None:
        return UnknownUnit()
    return round(convert(value), 6)
