"""Experiment instructions (spec 0005, instructions path): the limits, and what a notebook
stores of them. Pure: no I/O.

The limits are mirrored by `web/src/lib/instructions.ts`; a test on each side pins the
same numbers, so a change must touch both.
"""

import io
import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

from pypdf import PasswordType, PdfReader

from app.services.results import (
    InstructionsMissing,
    InstructionsTooShort,
    InvalidPageRange,
    NeedsPages,
    NoTextInPdf,
    PagesTooLong,
    PdfError,
    PdfUnreadable,
    TextError,
    TextTooLong,
    TooManyPages,
)
from app.services.setup_rules import ReadText

MAX_PDF_BYTES = 10_485_760
MAX_PAGES = 80
MAX_READ_CHARS = 100_000
MIN_TEXT_CHARS = 50
MIN_PDF_CHARS = 100
FILENAME_MAX = 255
DEFAULT_FILENAME = "instrucciones.pdf"


@dataclass(frozen=True, slots=True)
class NewProtocol:
    """The instructions saved with a new notebook, in the same transaction (AC-29)."""

    source: Literal["pdf", "text"]
    pages: tuple[str, ...]  # every page's text; pasted text is one page
    filename: str | None = None
    file_bytes: bytes | None = None
    read_from_page: int | None = None
    read_to_page: int | None = None


def check_text(text: str) -> str | TextError:
    """Pasted instructions, trimmed, between 50 and 100 000 characters (AC-20, AC-30)."""
    trimmed = text.strip()
    if len(trimmed) < MIN_TEXT_CHARS:
        return InstructionsTooShort()
    if len(trimmed) > MAX_READ_CHARS:
        return TextTooLong()
    return trimmed


@dataclass(frozen=True, slots=True)
class Instructions:
    """Checked instructions: every page, and the pages the model reads."""

    source: Literal["pdf", "text"]
    pages: tuple[str, ...]
    read_from_page: int | None = None
    read_to_page: int | None = None

    @property
    def read(self) -> ReadText:
        if self.source == "text":
            return ReadText(self.pages, None)
        first = self.read_from_page or 1
        last = self.read_to_page or len(self.pages)
        return ReadText(self.pages[first - 1 : last], first)

    @property
    def read_text(self) -> str:
        """The text the model reads: pages joined with a form feed, so a quote's page can be
        found again."""
        return "\f".join(self.read.pages)

    @property
    def char_count(self) -> int:
        """Page text only, not the form feeds between pages (Settled rules, Counts)."""
        return sum(len(page) for page in self.read.pages)


def check_parts(has_file: bool, has_text: bool) -> InstructionsMissing | None:
    """Exactly one of a file and pasted text (AC-30)."""
    return None if has_file != has_text else InstructionsMissing()


def check_page_range(
    from_page: int | None, to_page: int | None, page_count: int, *, allowed: bool
) -> InvalidPageRange | None:
    """Both fields or neither, inside 1 to `page_count`, from ≤ to. Pasted text takes none."""
    if from_page is None and to_page is None:
        return None
    if not allowed or from_page is None or to_page is None:
        return InvalidPageRange(page_count=page_count)
    if not 1 <= from_page <= to_page <= page_count:
        return InvalidPageRange(page_count=page_count)
    return None


def from_text(
    text: str, from_page: int | None, to_page: int | None
) -> Instructions | InvalidPageRange | TextError:
    """Pasted instructions: a page range is refused, then the length checks (AC-30 order)."""
    refused = check_page_range(from_page, to_page, 1, allowed=False)
    if refused is not None:
        return refused
    checked = check_text(text)
    if not isinstance(checked, str):
        return checked
    return Instructions(source="text", pages=(checked,))


def check_read_size(instructions: Instructions) -> NeedsPages | PagesTooLong | None:
    """Before any model call (AC-22): too long with no range asks for pages; too long with a
    range is refused. A range on a short PDF is simply read."""
    if instructions.char_count <= MAX_READ_CHARS:
        return None
    if instructions.read_from_page is None:
        return NeedsPages(page_count=len(instructions.pages), char_count=instructions.char_count)
    return PagesTooLong()


def extract_pages(data: bytes) -> tuple[str, ...] | PdfError:
    """Every page's text, NUL characters removed (Postgres text cannot hold them). Anything
    that is not a PDF, is damaged, or needs a real password is `PdfUnreadable`; more than 80
    pages is refused before any page is extracted. CPU work: call it from a thread."""
    if not data.startswith(b"%PDF-"):
        return PdfUnreadable()
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and reader.decrypt("") == PasswordType.NOT_DECRYPTED:
            return PdfUnreadable()
        count = len(reader.pages)
        if count > MAX_PAGES:
            return TooManyPages(page_count=count)
        if count == 0:
            return PdfUnreadable()
        return tuple((page.extract_text() or "").replace("\x00", "") for page in reader.pages)
    # Untrusted input to a parser: any failure while opening or extracting means the file
    # cannot be read, never a 500 (spec 0005, Settled rules).
    except Exception:  # noqa: BLE001
        return PdfUnreadable()


def from_pages(
    pages: tuple[str, ...], from_page: int | None, to_page: int | None
) -> Instructions | InvalidPageRange | NoTextInPdf:
    """A PDF's pages: the range check, then the text check on the pages being read."""
    refused = check_page_range(from_page, to_page, len(pages), allowed=True)
    if refused is not None:
        return refused
    instructions = Instructions(
        source="pdf", pages=pages, read_from_page=from_page, read_to_page=to_page
    )
    if sum(len(page.strip()) for page in instructions.read.pages) < MIN_PDF_CHARS:
        return NoTextInPdf()
    return instructions


def clean_filename(name: str | None) -> str:
    """The upload's name with any directory part and control characters removed, trimmed,
    cut to 255; `instrucciones.pdf` when nothing is left."""
    base = re.split(r"[/\\]", name or "")[-1]
    printable = "".join(char for char in base if unicodedata.category(char) != "Cc")
    cleaned = printable.strip()[:FILENAME_MAX].strip()
    return cleaned or DEFAULT_FILENAME
