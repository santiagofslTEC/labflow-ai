"""Number reading and grounding (spec 0006, AC-10 and AC-21). Pure.

Every value on a card must come from the user's words: `ground` finds the span of the
sentence a value was read from, and `said_slice` cuts the user's own text for it.
"""

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from itertools import pairwise
from types import MappingProxyType

from app.models.enums import Grounding
from app.services.text import fold
from app.services.units import match_unit_at

TOLERANCE = 1e-9
_MAX_NUMBER_TOKENS = 12

_UNITS: Mapping[str, int] = MappingProxyType(
    {
        "cero": 0,
        "un": 1,
        "uno": 1,
        "una": 1,
        "dos": 2,
        "tres": 3,
        "cuatro": 4,
        "cinco": 5,
        "seis": 6,
        "siete": 7,
        "ocho": 8,
        "nueve": 9,
        "diez": 10,
        "once": 11,
        "doce": 12,
        "trece": 13,
        "catorce": 14,
        "quince": 15,
        "dieciseis": 16,
        "diecisiete": 17,
        "dieciocho": 18,
        "diecinueve": 19,
        "veinte": 20,
        "veintiun": 21,
        "veintiuno": 21,
        "veintiuna": 21,
        "veintidos": 22,
        "veintitres": 23,
        "veinticuatro": 24,
        "veinticinco": 25,
        "veintiseis": 26,
        "veintisiete": 27,
        "veintiocho": 28,
        "veintinueve": 29,
    }
)
_TENS: Mapping[str, int] = MappingProxyType(
    {
        "treinta": 30,
        "cuarenta": 40,
        "cincuenta": 50,
        "sesenta": 60,
        "setenta": 70,
        "ochenta": 80,
        "noventa": 90,
    }
)
_HUNDREDS: Mapping[str, int] = MappingProxyType(
    {
        "ciento": 100,
        "doscientos": 200,
        "doscientas": 200,
        "trescientos": 300,
        "trescientas": 300,
        "cuatrocientos": 400,
        "cuatrocientas": 400,
        "quinientos": 500,
        "quinientas": 500,
        "seiscientos": 600,
        "seiscientas": 600,
        "setecientos": 700,
        "setecientas": 700,
        "ochocientos": 800,
        "ochocientas": 800,
        "novecientos": 900,
        "novecientas": 900,
    }
)
_DECIMAL_WORDS = frozenset({"coma", "punto"})
_NEGATIVE_WORD = "menos"
_TRIAL_WORDS = frozenset({"ensayo", "prueba", "corrida"})
# Slips read as a trial word too (spec 0006, AC-32), besides one edit away from one.
_TRIAL_SPELLINGS = frozenset({"ensallo", "enzayo", "ensaio"})
_NUMBER_WORDS = frozenset({"numero", "no", "nro", "n"})  # "ensayo número 6"

_DIGITS = re.compile(r"^-?(?:\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)$")
_THOUSANDS = re.compile(r"^-?\d{1,3}(?:\.\d{3})+$")
_TOKEN = re.compile(r"-?\d+(?:[.,]\d+)*|[a-zñ]+")
_SPACES = re.compile(r" +")


@dataclass(frozen=True, slots=True)
class Span:
    """A number in the sentence: `[start, end)` in the original text and its value."""

    start: int
    end: int
    value: float
    is_trial: bool  # it follows "ensayo", "prueba", or "corrida"


@dataclass(frozen=True, slots=True)
class Grounded:
    span: Span
    grounding: Grounding  # model: the quoted words matched; code: the fallback matched


@dataclass(frozen=True, slots=True)
class Said:
    text: str  # the user's own text: the number, plus the unit words right after it
    unit: str | None  # the canonical unit of those words, or None when no unit was said


def _below_thousand(words: Sequence[str]) -> int | None:
    """0 to 999 from words that must all be used: [hundreds] [tens [y unit] | unit]."""
    rest = list(words)
    total = 0
    if rest and rest[0] == "cien":
        return 100 if len(rest) == 1 else None
    if rest and rest[0] in _HUNDREDS:
        hundreds = rest.pop(0)
        if hundreds == "ciento" and not rest:
            return None  # "ciento" alone is not a number ("por ciento"); "cien" is
        total += _HUNDREDS[hundreds]
    if not rest:
        return total if words else None
    if rest[0] in _TENS:
        total += _TENS[rest.pop(0)]
        if not rest:
            return total
        if len(rest) == 2 and rest[0] == "y" and 1 <= _UNITS.get(rest[1], 0) <= 9:
            return total + _UNITS[rest[1]]
        return None
    if len(rest) == 1 and rest[0] in _UNITS:
        unit = _UNITS[rest[0]]
        # "cero" stands alone; "ciento cero" is not a number.
        return None if unit == 0 and total else total + unit
    return None


def _integer_words(words: Sequence[str]) -> int | None:
    """0 to 999 999: [below_thousand] mil [below_thousand], or below_thousand alone."""
    if words.count("mil") > 1:
        return None
    if "mil" not in words:
        return _below_thousand(words)
    at = words.index("mil")
    head, tail = words[:at], words[at + 1 :]
    thousands = 1 if not head else _below_thousand(head)
    if thousands is None or (head and thousands < 2):  # "mil", "dos mil"; not "un mil"
        return None
    rest = _below_thousand(tail) if tail else 0
    if rest is None or (tail and rest == 0):
        return None
    return thousands * 1000 + rest


def _integer_part(words: Sequence[str]) -> int | None:
    if len(words) == 1 and words[0].isdigit():
        return int(words[0])
    return _integer_words(words)


def _decimal_digits(words: Sequence[str]) -> str | None:
    """The digits after "coma": "cero cinco" → "05", "veinticinco" → "25", "5" → "5"."""
    if len(words) == 1 and words[0].isdigit():
        return words[0]
    if words and all(w in _UNITS and _UNITS[w] <= 9 and w not in {"un", "una"} for w in words):
        return "".join(str(_UNITS[w]) for w in words)
    whole = _integer_words(words)
    return None if whole is None else str(whole)


def parse_number(text: str) -> float | None:
    """A number written in digits or Spanish words, or None when `text` is not exactly one.

    Digits take a comma or dot decimal; a dot followed by exactly three digits with no
    decimal part is a thousands separator ("1.200" is 1200). Words go from cero to
    novecientos noventa y nueve mil novecientos noventa y nueve, with "coma" or "punto"
    decimals and "menos" for negatives.
    """
    folded = fold(text).strip()
    if _DIGITS.match(folded):
        if _THOUSANDS.match(folded):
            return float(folded.replace(".", ""))
        return float(folded.replace(",", "."))
    words = folded.split()
    if not words:
        return None
    sign = 1.0
    if words[0] == _NEGATIVE_WORD:
        sign, words = -1.0, words[1:]
        if len(words) == 1 and _DIGITS.match(words[0]) and not words[0].startswith("-"):
            unsigned = parse_number(words[0])
            return None if unsigned is None else -unsigned
    marks = [i for i, word in enumerate(words) if word in _DECIMAL_WORDS]
    if len(marks) > 1:
        return None
    if not marks:
        whole = _integer_part(words)
        return None if whole is None else sign * whole
    at = marks[0]
    whole = _integer_part(words[:at])
    digits = _decimal_digits(words[at + 1 :])
    if whole is None or digits is None:
        return None
    return sign * float(f"{whole}.{digits}")


@dataclass(frozen=True, slots=True)
class _Token:
    start: int
    end: int
    text: str  # folded


def _tokens(folded: str) -> list[_Token]:
    return [_Token(m.start(), m.end(), m.group()) for m in _TOKEN.finditer(folded)]


def _one_edit(word: str, target: str) -> bool:
    """One letter changed, added, or dropped, or two neighbors swapped ("esnayo")."""
    if word == target or abs(len(word) - len(target)) > 1:
        return word == target
    if len(word) == len(target):
        diff = [i for i, (a, b) in enumerate(zip(word, target, strict=True)) if a != b]
        swapped = (
            len(diff) == 2
            and diff[1] == diff[0] + 1
            and (word[diff[0]], word[diff[1]]) == (target[diff[1]], target[diff[0]])
        )
        return len(diff) == 1 or swapped
    short, long = sorted((word, target), key=len)
    return any(long[:i] + long[i + 1 :] == short for i in range(len(long)))


def _is_trial_word(word: str) -> bool:
    return (
        word in _TRIAL_WORDS
        or word in _TRIAL_SPELLINGS
        or (len(word) >= 5 and any(_one_edit(word, t) for t in _TRIAL_WORDS))
    )


def _follows_trial_word(tokens: Sequence[_Token], index: int) -> bool:
    before = [t.text for t in tokens[max(0, index - 2) : index]]
    if before and _is_trial_word(before[-1]):
        return True
    return len(before) == 2 and _is_trial_word(before[0]) and before[1] in _NUMBER_WORDS


def _could_start(token: _Token) -> bool:
    word = token.text
    return (
        word[0].isdigit()
        or word.startswith("-")
        or word == _NEGATIVE_WORD
        or word in _UNITS
        or word in _TENS
        or word in _HUNDREDS
        or word in {"cien", "mil"}
    )


def _is_negative_sign(folded: str, token: _Token) -> bool:
    """A "-" glued to digits is a sign only at the start or after a space ("pH-7" is not)."""
    return token.text.startswith("-") and (token.start == 0 or folded[token.start - 1] == " ")


def find_numbers(utterance: str) -> list[Span]:
    """Every number in the sentence, longest reading first, left to right."""
    folded = fold(utterance)
    tokens = _tokens(folded)
    spans: list[Span] = []
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token.text.startswith("-") and not _is_negative_sign(folded, token):
            token = _Token(token.start + 1, token.end, token.text[1:])
        if not _could_start(token):
            i += 1
            continue
        best: tuple[int, float] | None = None
        for j in range(min(len(tokens), i + _MAX_NUMBER_TOKENS), i, -1):
            last = tokens[j - 1]
            inner = tokens[i:j]
            # Words are joined by spaces only; a comma or any other mark ends the number.
            if any(t.text.startswith("-") for t in inner[1:]) or any(
                not _SPACES.fullmatch(folded[a.end : b.start]) for a, b in pairwise(inner)
            ):
                continue
            value = parse_number(folded[token.start : last.end])
            if value is not None:
                best = (j, value)
                break
        if best is None:
            i += 1
            continue
        j, value = best
        spans.append(Span(token.start, tokens[j - 1].end, value, _follows_trial_word(tokens, i)))
        i = j
    return spans


def _same(a: float, b: float) -> bool:
    return abs(a - b) <= TOLERANCE


def ground(
    utterance: str, number_text: str, value: float, taken: Iterable[int] = ()
) -> Grounded | None:
    """The span a model value was read from, or None when it is not in the user's words.

    First the model's quoted words: a number span whose text is exactly `number_text` (whole
    words, so "6" never matches inside "65") and parses to `value`. Then the code fallback:
    the single non trial span whose value equals `value`. Spans starting at an index in
    `taken` are already used by another value. A trial span ("ensayo 6") always fails.
    """
    used = frozenset(taken)
    spans = [s for s in find_numbers(utterance) if not s.is_trial and s.start not in used]
    folded = fold(utterance)
    quoted = " ".join(fold(number_text).split())
    quoted_value = parse_number(number_text)
    if quoted and quoted_value is not None and _same(quoted_value, value):
        for span in spans:
            words = " ".join(folded[span.start : span.end].split())
            if words == quoted and _same(span.value, value):
                return Grounded(span, Grounding.MODEL)
    matches = [s for s in spans if _same(s.value, value)]
    return Grounded(matches[0], Grounding.CODE) if len(matches) == 1 else None


def said_slice(utterance: str, span: Span, own_unit: str | None = None) -> Said:
    """The user's own text for a span, extended over the unit words right after it."""
    unit = match_unit_at(utterance, span.end, own_unit)
    end = span.end if unit is None else unit.end
    return Said(text=utterance[span.start : end], unit=None if unit is None else unit.unit)
