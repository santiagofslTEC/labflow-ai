"""Notebooks: list, create, and open (spec 0005). Users see "cuaderno"; the API says experiment.

The instructions path adds a read route that proposes a notebook and stores nothing, and a
multipart create that saves the notebook with its instructions in one transaction."""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, Form, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, Json

from app.ai.deps import ProviderDep
from app.ai.provider import ProviderFailure
from app.core.db import SessionDep
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep
from app.core.instruction_reads import InstructionReads, InstructionReadsDep
from app.repositories import experiments
from app.services.experiment_rules import NewExperiment, check_new_experiment
from app.services.instructions import (
    MAX_PAGES,
    MAX_PDF_BYTES,
    MAX_READ_CHARS,
    Instructions,
    NewProtocol,
    check_parts,
    check_read_size,
    clean_filename,
    extract_pages,
    from_pages,
    from_text,
)
from app.services.results import (
    DuplicateVariableName,
    ExperimentDetail,
    ExperimentNotFound,
    ExperimentSummary,
    FileTooLarge,
    InstructionsError,
    InstructionsMissing,
    InstructionsTooShort,
    InvalidPageRange,
    InvalidRange,
    NeedsPages,
    NewExperimentError,
    NoTextInPdf,
    PagesTooLong,
    PdfUnreadable,
    ReadingFailed,
    ReadingInProgress,
    TextTooLong,
    TooManyPages,
)
from app.services.setup_rules import ProposedVariableOut, ground_proposal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/experiments", tags=["experiments"])

# Ids are Postgres bigint identities; anything outside can never exist.
_ID_MAX = 2**63 - 1

_UNAUTHORIZED = {"model": ApiErrorBody, "description": "No valid access session"}


@router.get("", responses={401: _UNAUTHORIZED})
def list_experiments(session: SessionDep) -> list[ExperimentSummary]:
    return experiments.list_summaries(session)


@router.post(
    "",
    status_code=201,
    responses={
        401: _UNAUTHORIZED,
        422: {
            "model": ApiErrorBody,
            "description": "invalid_request, duplicate_variable_name, or invalid_range",
        },
    },
)
def create_experiment(
    body: NewExperiment, session: SessionDep, holder: HolderDep
) -> ExperimentDetail:
    checked = check_new_experiment(body)
    result = (
        checked if checked is not None else experiments.create_experiment(session, holder, body)
    )
    return _created(result, holder, None)


def _created(
    result: ExperimentDetail | NewExperimentError, holder: str, protocol: NewProtocol | None
) -> ExperimentDetail:
    """Both create routes answer the same way (AC-15, AC-29)."""
    match result:
        case ExperimentDetail():
            logger.info(
                "experiment created",
                extra={
                    "experiment_id": result.id,
                    "holder": holder,
                    "variable_count": len(result.variables),
                    "has_protocol": protocol is not None,
                    "protocol_source": None if protocol is None else protocol.source,
                },
            )
            return result
        case DuplicateVariableName(name=name):
            logger.warning("experiment not created", extra={"code": result.code})
            message = (
                f"Hay dos variables llamadas «{name}». Cambia una."
                if name is not None
                else "Hay dos variables con el mismo nombre."
            )
            raise ApiError(422, result.code, message)
        case InvalidRange(name=name):
            logger.warning("experiment not created", extra={"code": result.code})
            raise ApiError(
                422, result.code, f"En «{name}», el mínimo no puede ser mayor que el máximo."
            )


@router.get(
    "/{experiment_id}",
    responses={
        401: _UNAUTHORIZED,
        404: {"model": ApiErrorBody, "description": "No notebook with this id"},
        422: {"model": ApiErrorBody, "description": "The id is not an integer"},
    },
)
def read_experiment(experiment_id: int, session: SessionDep) -> ExperimentDetail:
    result = (
        experiments.get_experiment(session, experiment_id)
        if 1 <= experiment_id <= _ID_MAX
        else ExperimentNotFound()
    )
    if isinstance(result, ExperimentNotFound):
        raise ApiError(404, result.code, "Este cuaderno no existe.")
    return result


# --- The instructions path (spec 0005, AC-19 to AC-35) ---

_TOO_LONG_TEXT = "Pega solo la parte de tu práctica (máximo 100 000 caracteres)."

_INSTRUCTIONS_ERRORS = {
    401: _UNAUTHORIZED,
    413: {"model": ApiErrorBody, "description": "file_too_large"},
    422: {
        "model": ApiErrorBody,
        "description": "invalid_request, instructions_missing, pdf_unreadable, too_many_pages, "
        "invalid_page_range, no_text_in_pdf, instructions_too_short, or text_too_long",
    },
}


def _instructions_error(
    error: InstructionsError | PagesTooLong | ReadingInProgress | ReadingFailed,
) -> ApiError:
    """The status and Spanish message for each instructions failure (AC-22, AC-28, AC-30)."""
    logger.warning("instructions refused", extra={"code": error.code})
    match error:
        case InstructionsMissing():
            return ApiError(422, error.code, "Sube un PDF o pega las instrucciones.")
        case FileTooLarge():
            return ApiError(413, error.code, "El PDF pesa más de 10 MB.")
        case PdfUnreadable():
            return ApiError(
                422, error.code, "No pudimos abrir este PDF. Prueba con otro o pega el texto."
            )
        case TooManyPages(page_count=n):
            return ApiError(422, error.code, f"El PDF tiene {n} páginas; el máximo es {MAX_PAGES}.")
        case InvalidPageRange(page_count=n):
            return ApiError(422, error.code, f"Elige páginas entre 1 y {n}.")
        case NoTextInPdf():
            return ApiError(422, error.code, "Este PDF no tiene texto. Pega las instrucciones.")
        case InstructionsTooShort():
            return ApiError(422, error.code, "Pega un poco más de las instrucciones.")
        case TextTooLong():
            return ApiError(422, error.code, _TOO_LONG_TEXT)
        case PagesTooLong():
            return ApiError(
                422, error.code, "Esas páginas tienen demasiado texto. Elige menos páginas."
            )
        case ReadingInProgress():
            return ApiError(
                409, error.code, "Ya estamos leyendo unas instrucciones. Espera a que termine."
            )
        case ReadingFailed():
            return ApiError(
                503,
                error.code,
                "No pudimos leer las instrucciones. Llena el formulario o intenta de nuevo.",
            )


EXTRACT_TIMEOUT_S = 15


@dataclass(frozen=True, slots=True)
class _Upload:
    """Checked instructions, plus the PDF's bytes and name when one was sent."""

    instructions: Instructions
    file_bytes: bytes | None = None
    filename: str | None = None

    def protocol(self) -> NewProtocol:
        return NewProtocol(
            source=self.instructions.source,
            pages=self.instructions.pages,
            filename=self.filename,
            file_bytes=self.file_bytes,
            read_from_page=self.instructions.read_from_page,
            read_to_page=self.instructions.read_to_page,
        )


async def _extract(data: bytes, reads: InstructionReads) -> tuple[str, ...]:
    """CPU work off the event loop, at most two at once, and never past 15 s. A timed out
    thread is left to finish on its own (accepted)."""
    async with reads.extractions:
        try:
            async with asyncio.timeout(EXTRACT_TIMEOUT_S):
                pages = await run_in_threadpool(extract_pages, data)
        except TimeoutError:
            pages = PdfUnreadable()
    if not isinstance(pages, tuple):
        raise _instructions_error(pages)
    return pages


async def _instructions(
    file: UploadFile | None,
    text: str | None,
    from_page: int | None,
    to_page: int | None,
    reads: InstructionReads,
) -> _Upload:
    """Every AC-30 check in order, up to the text checks. Raises the first failure. The file
    is read with a cap, so its size is checked without trusting the client's header."""
    missing = check_parts(has_file=file is not None, has_text=text is not None)
    if missing is not None:
        raise _instructions_error(missing)
    if file is None:
        assert text is not None  # checked above
        pasted = from_text(text, from_page, to_page)
        if not isinstance(pasted, Instructions):
            raise _instructions_error(pasted)
        return _Upload(instructions=pasted)
    data = await file.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise _instructions_error(FileTooLarge())
    pages = await _extract(data, reads)
    read = from_pages(pages, from_page, to_page)
    if not isinstance(read, Instructions):
        raise _instructions_error(read)
    return _Upload(instructions=read, file_bytes=data, filename=clean_filename(file.filename))


class InstructionsProposal(BaseModel):
    """A checked proposal that fills the form (AC-23)."""

    model_config = ConfigDict(frozen=True)

    kind: Literal["proposal"] = "proposal"
    title: str
    goal: str | None
    context: str | None
    variables: tuple[ProposedVariableOut, ...]
    found_count: int
    page_count: int
    read_from_page: int | None
    read_to_page: int | None


class InstructionsNeedPages(BaseModel):
    """The PDF is too long to read whole: ask which pages (AC-22)."""

    model_config = ConfigDict(frozen=True)

    kind: Literal["needs_pages"] = "needs_pages"
    page_count: int
    char_count: int
    max_chars: int = MAX_READ_CHARS


type InstructionsRead = Annotated[
    InstructionsProposal | InstructionsNeedPages, Field(discriminator="kind")
]


@router.post(
    "/instructions/read",
    responses={
        **_INSTRUCTIONS_ERRORS,
        409: {"model": ApiErrorBody, "description": "reading_in_progress"},
        422: {
            "model": ApiErrorBody,
            "description": f"{_INSTRUCTIONS_ERRORS[422]['description']}, or pages_too_long",
        },
        503: {"model": ApiErrorBody, "description": "reading_failed"},
    },
)
async def read_instructions(
    holder: HolderDep,
    provider: ProviderDep,
    reads: InstructionReadsDep,
    file: UploadFile | None = None,
    text: Annotated[str | None, Form()] = None,
    from_page: Annotated[int | None, Form()] = None,
    to_page: Annotated[int | None, Form()] = None,
) -> InstructionsRead:
    """Reads the instructions once and proposes a notebook. Stores nothing (AC-32)."""
    started = time.monotonic()
    instructions = (await _instructions(file, text, from_page, to_page, reads)).instructions
    size = check_read_size(instructions)
    if isinstance(size, NeedsPages):
        return InstructionsNeedPages(page_count=size.page_count, char_count=size.char_count)
    if size is not None:
        raise _instructions_error(size)
    async with reads.slot(holder) as free:
        if not free:
            raise _instructions_error(ReadingInProgress())
        outcome = (
            await provider.propose_setup(instructions.read_text)
            if provider is not None
            else ProviderFailure("none", "no_key")
        )
    if isinstance(outcome, ProviderFailure):
        logger.warning(
            "instructions not read",
            extra={"provider": outcome.provider, "failure": outcome.reason},
        )
        raise _instructions_error(ReadingFailed())
    proposal = ground_proposal(outcome.call, instructions.read)
    proposed_ranges = sum(
        1 for v in outcome.call.variables if v.min_value is not None or v.max_value is not None
    )
    kept_ranges = sum(
        1 for v in proposal.variables if v.min_value is not None or v.max_value is not None
    )
    logger.info(
        "instructions read",
        extra={
            "source": instructions.source,
            "page_count": len(instructions.pages),
            "char_count": instructions.char_count,
            "provider": outcome.provider,
            "fallback_reason": outcome.fallback_reason,
            "duration_ms": round((time.monotonic() - started) * 1000),
            "found_count": proposal.found_count,
            "kept_count": len(proposal.variables),
            "ranges_dropped": proposed_ranges - kept_ranges,
        },
    )
    return InstructionsProposal(
        title=proposal.title,
        goal=proposal.goal,
        context=proposal.context,
        variables=proposal.variables,
        found_count=proposal.found_count,
        page_count=len(instructions.pages),
        read_from_page=instructions.read_from_page,
        read_to_page=instructions.read_to_page,
    )


@router.post(
    "/with-instructions",
    status_code=201,
    responses={
        **_INSTRUCTIONS_ERRORS,
        422: {
            "model": ApiErrorBody,
            "description": f"{_INSTRUCTIONS_ERRORS[422]['description']}, "
            "duplicate_variable_name, or invalid_range",
        },
    },
)
async def create_with_instructions(
    body: Annotated[Json[NewExperiment], Form()],
    session: SessionDep,
    holder: HolderDep,
    reads: InstructionReadsDep,
    file: UploadFile | None = None,
    instructions_text: Annotated[str | None, Form()] = None,
    read_from_page: Annotated[int | None, Form()] = None,
    read_to_page: Annotated[int | None, Form()] = None,
) -> ExperimentDetail:
    """The notebook, its variables, and its instructions in one transaction (AC-29). The
    instructions are checked again here; text from the browser is never trusted."""
    upload = await _instructions(file, instructions_text, read_from_page, read_to_page, reads)
    protocol = upload.protocol()
    checked = check_new_experiment(body)
    result = (
        checked
        if checked is not None
        else await run_in_threadpool(experiments.create_experiment, session, holder, body, protocol)
    )
    return _created(result, holder, protocol)
