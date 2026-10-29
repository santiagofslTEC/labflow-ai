"""No invented numbers in a notebook read from instructions (spec 0005, AC-25). Pure.

The model proposes; code keeps a range only when its quote is in the text, word for word, and
holds both bounds as written digits. The page of a quote comes from code, never the model.
"""

import re
import unicodedata
from dataclasses import dataclass
from itertools import accumulate

from pydantic import BaseModel, ConfigDict

from app.ai.tools import ProponerCuaderno, ProposedVariable
from app.services.experiment_rules import CONTEXT_MAX, GOAL_MAX, NAME_MAX, TITLE_MAX, UNIT_MAX
from app.services.units import canonical, is_known_unit

VARIABLES_KEPT = 12
TOLERANCE = 1e-9

# A word cut by a hyphen at a line end ("tempera-\nture"), then any run of whitespace.
_LINE_HYPHEN = re.compile(r"(\w)-[ \t]*\r?\n\s*(\w)")
_SPACES = re.compile(r"\s+")
# Digits with optional decimal marks; a run with more than one mark is not a number here.
_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
_MINUS = frozenset("-\N{MINUS SIGN}")
# A sentence ends at . ; ? ! or a line break; a point between digits is a decimal mark.
_SENTENCE_END = re.compile(r"(?<=[;?!\n])|(?<=\.)(?!\d)")


class ProposedVariableOut(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    unit: str | None
    min_value: float | None
    max_value: float | None
    required: bool
    range_quote: str | None
    range_page: int | None  # from code; null for pasted text


class SetupProposal(BaseModel):
    """The checked proposal that fills the form (AC-23)."""

    model_config = ConfigDict(frozen=True)

    title: str
    goal: str | None
    context: str | None
    variables: tuple[ProposedVariableOut, ...]
    found_count: int


@dataclass(frozen=True, slots=True)
class ReadText:
    """The pages the model read, and the number of the first one (None for pasted text)."""

    pages: tuple[str, ...]
    first_page: int | None


def normalize_for_match(text: str) -> str:
    """NFKC (which also expands ligatures like "ﬁ"), a hyphen at a line end joined to the
    next word, whitespace collapsed to one space, then `casefold()`."""
    joined = _LINE_HYPHEN.sub(r"\1\2", unicodedata.normalize("NFKC", text))
    return _SPACES.sub(" ", joined).strip().casefold()


def quote_numbers(text: str) -> tuple[float, ...]:
    """The written numbers in `text`: an optional sign, digits, and at most one comma or
    point decimal. A dash between two numbers is a separator ("40-80" is 40 and 80, and so
    is the same with an en dash); thousands separators and number words are not read."""
    found: list[float] = []
    for match in _NUMBER.finditer(text):
        digits = match.group()
        if len(re.findall(r"[.,]", digits)) > 1:
            continue
        value = float(digits.replace(",", "."))
        start = match.start()
        if start > 0 and text[start - 1] in _MINUS and not _after_number(text, start - 1):
            value = -value
        found.append(value)
    return tuple(found)


def _after_number(text: str, at: int) -> bool:
    """Whether the closest non space character before `at` is a digit."""
    before = text[:at].rstrip()
    return bool(before) and before[-1].isdigit()


def _has_value(values: tuple[float, ...], value: float) -> bool:
    return any(abs(v - value) <= TOLERANCE for v in values)


def cut(text: str, limit: int) -> str:
    """At most `limit` characters, cut at the last space before it, or at the limit."""
    if len(text) <= limit:
        return text
    head = text[:limit]
    space = head.rfind(" ")
    return (head[:space] if space > 0 else head).rstrip()


def _unit(raw: str | None) -> str | None:
    """Step 5: the canonical unit when known, else the trimmed text up to 20, else null."""
    if raw is None or not raw.strip():
        return None
    if is_known_unit(raw):
        return canonical(raw)
    trimmed = raw.strip()
    return trimmed if len(trimmed) <= UNIT_MAX else None


@dataclass(frozen=True, slots=True)
class _Index:
    """The read pages normalized and joined by one space, with where each page starts."""

    text: str
    starts: tuple[int, ...]
    first_page: int | None

    def page_at(self, offset: int) -> int | None:
        if self.first_page is None:
            return None
        page = sum(1 for start in self.starts if start <= offset) - 1
        return self.first_page + page


def _index(read: ReadText) -> _Index:
    pages = [normalize_for_match(page) for page in read.pages]
    starts = tuple(accumulate((len(p) + 1 for p in pages[:-1]), initial=0))
    return _Index(" ".join(pages), starts, read.first_page)


def _ground_range(
    variable: ProposedVariable, index: _Index
) -> tuple[float | None, float | None, str | None, int | None]:
    """Steps 1 and 2: the bounds, quote, and page, or all null when the check fails."""
    low, high, quote = variable.min_value, variable.max_value, variable.range_quote
    dropped = (None, None, None, None)
    if quote is None or not quote.strip() or (low is None and high is None):
        return dropped
    if low is not None and high is not None and low > high:
        return dropped
    needle = normalize_for_match(quote)
    at = index.text.find(needle)
    if at < 0:
        return dropped
    numbers = quote_numbers(unicodedata.normalize("NFKC", quote))
    if any(bound is not None and not _has_value(numbers, bound) for bound in (low, high)):
        return dropped
    return low, high, quote.strip(), index.page_at(at)


def _context(raw: str | None, read_numbers: tuple[float, ...]) -> str | None:
    """Step 3: drop each sentence holding a number not in the read text; then step 6."""
    if raw is None:
        return None
    sentences = _SENTENCE_END.split(raw)
    kept = [
        sentence
        for sentence in sentences
        if all(_has_value(read_numbers, n) for n in quote_numbers(sentence))
    ]
    text = _SPACES.sub(" ", "".join(kept)).strip()
    return cut(text, CONTEXT_MAX) or None


def ground_proposal(raw: ProponerCuaderno, read: ReadText) -> SetupProposal:
    """The seven steps of AC-25, with the cut (6) before the dedupe (4) as the spec settles."""
    index = _index(read)
    read_numbers = quote_numbers(unicodedata.normalize("NFKC", "\n".join(read.pages)))
    grounded: list[ProposedVariableOut] = []
    seen: set[str] = set()
    for variable in raw.variables:
        name = cut(variable.name.strip(), NAME_MAX)
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        low, high, quote, page = _ground_range(variable, index)
        grounded.append(
            ProposedVariableOut(
                name=name,
                unit=_unit(variable.unit),
                min_value=low,
                max_value=high,
                required=variable.required,
                range_quote=quote,
                range_page=page,
            )
        )
    goal = cut(raw.goal.strip(), GOAL_MAX) if raw.goal else ""
    return SetupProposal(
        title=cut(raw.title.strip(), TITLE_MAX),
        goal=goal or None,
        context=_context(raw.context, read_numbers),
        variables=tuple(grounded[:VARIABLES_KEPT]),
        found_count=len(grounded),
    )
