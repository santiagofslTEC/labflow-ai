"""Typed results of the repositories (spec 0002 proposal lifecycle, spec 0005 notebooks).

Expected failures are values, never exceptions. Each carries the snake_case `code` the
router edge puts in the API error shape; the Spanish message is added there.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.enums import ExperimentStatus


class _Result(BaseModel):
    model_config = ConfigDict(frozen=True)


class Confirmed(_Result):
    trial_id: int
    created_trial: bool


class ExperimentNotFound(_Result):
    code: Literal["experiment_not_found"] = "experiment_not_found"


class ProposalNotFound(_Result):
    code: Literal["proposal_not_found"] = "proposal_not_found"


class NotPending(_Result):
    code: Literal["not_pending"] = "not_pending"


class TrialNotInExperiment(_Result):
    code: Literal["trial_not_in_experiment"] = "trial_not_in_experiment"


class VariableNotInExperiment(_Result):
    code: Literal["variable_not_in_experiment"] = "variable_not_in_experiment"


class InvalidTurn(_Result):
    """The turn is missing, from another experiment, or not a user turn."""

    code: Literal["invalid_turn"] = "invalid_turn"


class EmptyProposal(_Result):
    code: Literal["empty_proposal"] = "empty_proposal"


class MissingTrialNumber(_Result):
    code: Literal["missing_trial_number"] = "missing_trial_number"


class InvalidTrialNumber(_Result):
    """A trial number must be a whole number above zero."""

    code: Literal["invalid_trial_number"] = "invalid_trial_number"


class InvalidValue(_Result):
    """A measured value must be a finite number (not NaN or infinity)."""

    code: Literal["invalid_value"] = "invalid_value"


class TrialExists(_Result):
    """The dictated trial number is already saved; ask whether it is a correction (RN-02)."""

    code: Literal["trial_exists"] = "trial_exists"
    trial_id: int


class NotAutoSaved(_Result):
    """Only a save LabFlow made with no tap can be undone (spec 0006, AC-29)."""

    code: Literal["not_auto_saved"] = "not_auto_saved"


class UndoExpired(_Result):
    """A sentence came after the auto save, so it can no longer be undone (AC-29)."""

    code: Literal["undo_expired"] = "undo_expired"


class SavedNow(_Result):
    """What `save_now` wrote (spec 0011, AC-12). `proposal_id` is None when every slot was
    filled in between and nothing was written; `skipped` are those variable ids."""

    proposal_id: int | None
    trial_id: int
    created_trial: bool
    skipped: tuple[int, ...] = ()


class Undone(_Result):
    """How an undo ended (spec 0011, AC-10): the values came back as a pending card
    (`reopened`), joined the waiting card of the same trial (`merged`), or were dropped
    (`discarded`: another trial's card waits, or voice)."""

    outcome: Literal["reopened", "merged", "discarded"]
    proposal_id: int  # the pending card that holds the values now, or the dropped save
    experiment_id: int
    trial_number: int | None


type StartError = ExperimentNotFound | InvalidTrialNumber
type PendingError = ProposalNotFound | NotPending
type SetTrialError = PendingError | TrialNotInExperiment | InvalidTrialNumber
type SetValueError = PendingError | VariableNotInExperiment | InvalidTurn | InvalidValue
type ConfirmError = PendingError | EmptyProposal | MissingTrialNumber | TrialExists
type UndoError = ProposalNotFound | NotAutoSaved | UndoExpired


class ExperimentSummary(_Result):
    """One row of the notebook list (spec 0005, AC-14)."""

    id: int
    title: str
    status: ExperimentStatus
    trial_count: int
    last_activity_at: datetime  # UTC


class VariableDetail(_Result):
    id: int
    name: str
    unit: str | None
    min_value: float | None
    max_value: float | None
    required: bool
    position: int
    aliases: tuple[str, ...] = ()  # other names the capture prompt lists (spec 0008)


class ProtocolSummary(_Result):
    """What a notebook shows of its instructions (spec 0005, AC-31): never the bytes or text."""

    source: Literal["pdf", "text"]
    filename: str | None
    page_count: int
    read_from_page: int | None
    read_to_page: int | None


class TrialCell(_Result):
    """One saved value of a trial (spec 0007, AC-1). `saved_at` is the last edit, else the
    first confirm."""

    variable_id: int
    value: float  # in the variable's unit
    said_text: str | None
    saved_at: datetime  # UTC


class TrialRow(_Result):
    id: int
    number: int
    cells: tuple[TrialCell, ...]  # by variable id; the browser places them by position


class RecentMeasurement(_Result):
    trial_number: int
    variable_id: int
    value: float
    saved_at: datetime  # UTC


class TrialsView(_Result):
    """A notebook's saved trials by number, and its 5 newest measurements (spec 0007)."""

    trials: tuple[TrialRow, ...]
    recent: tuple[RecentMeasurement, ...]


class VariableNotFound(_Result):
    code: Literal["variable_not_found"] = "variable_not_found"


class ExperimentClosed(_Result):
    """A closed notebook's variables cannot change (spec 0008, AC-8)."""

    code: Literal["experiment_closed"] = "experiment_closed"


class VariablesFull(_Result):
    code: Literal["variables_full"] = "variables_full"


class UnitLocked(_Result):
    """The variable has saved values, which are stored in its unit (spec 0008, AC-3)."""

    code: Literal["unit_locked"] = "unit_locked"


class LastVariable(_Result):
    """A notebook keeps at least one variable (spec 0008, AC-5)."""

    code: Literal["last_variable"] = "last_variable"


class VariablesDeleted(_Result):
    """What a delete removed (spec 0008, AC-6)."""

    variables: int
    measurements: int
    trials: int


class VariableSummary(_Result):
    """One variable's saved values, worked out with SQL (spec 0009, AC-7). The trial lists
    name every trial holding the extreme, ascending; empty when there are no values."""

    variable_id: int
    count: int
    min: float | None
    max: float | None
    mean: float | None
    min_trials: tuple[int, ...]
    max_trials: tuple[int, ...]


class ResultsView(_Result):
    variables: tuple[VariableSummary, ...]  # position order


class ExperimentDetail(_Result):
    """A notebook with its variables in `position` order (spec 0005, AC-16 and AC-31)."""

    id: int
    title: str
    goal: str | None
    context: str | None
    status: ExperimentStatus
    created_by: str
    created_at: datetime
    variables: tuple[VariableDetail, ...]
    protocol: ProtocolSummary | None


class DuplicateVariableName(_Result):
    """Two variables share a name ignoring case. `name` is None when only the DB index caught it."""

    code: Literal["duplicate_variable_name"] = "duplicate_variable_name"
    name: str | None


class NameInUse(_Result):
    """A name or other name another variable already answers to (spec 0008, AC-10). `owner` is
    that variable's name when `word` is one of its other names, None when it is its name."""

    code: Literal["name_in_use"] = "name_in_use"
    word: str
    owner: str | None


class InvalidRange(_Result):
    """A variable's minimum is above its maximum."""

    code: Literal["invalid_range"] = "invalid_range"
    name: str


type NewExperimentError = DuplicateVariableName | InvalidRange


# --- Instructions (spec 0005, AC-30): each check's failure, in the order they run ---


class InstructionsMissing(_Result):
    """Neither or both of a file and pasted text were sent."""

    code: Literal["instructions_missing"] = "instructions_missing"


class FileTooLarge(_Result):
    code: Literal["file_too_large"] = "file_too_large"


class PdfUnreadable(_Result):
    """Not a PDF, damaged, encrypted with a real password, or too slow to extract."""

    code: Literal["pdf_unreadable"] = "pdf_unreadable"


class TooManyPages(_Result):
    code: Literal["too_many_pages"] = "too_many_pages"
    page_count: int


class InvalidPageRange(_Result):
    code: Literal["invalid_page_range"] = "invalid_page_range"
    page_count: int


class NoTextInPdf(_Result):
    """Under 100 characters of text on the pages being read (a scanned PDF)."""

    code: Literal["no_text_in_pdf"] = "no_text_in_pdf"


class InstructionsTooShort(_Result):
    code: Literal["instructions_too_short"] = "instructions_too_short"


class TextTooLong(_Result):
    code: Literal["text_too_long"] = "text_too_long"


class NeedsPages(_Result):
    """A long PDF read with no page range: ask which pages (AC-22). Not an error."""

    page_count: int
    char_count: int


class ReadingInProgress(_Result):
    """A read for the same holder is already running (AC-28)."""

    code: Literal["reading_in_progress"] = "reading_in_progress"


class ReadingFailed(_Result):
    """No provider answered with a usable proposal in time (AC-28, AC-33)."""

    code: Literal["reading_failed"] = "reading_failed"


class PagesTooLong(_Result):
    """The chosen pages are still over the read cap (AC-22)."""

    code: Literal["pages_too_long"] = "pages_too_long"


type TextError = InstructionsTooShort | TextTooLong
type PdfError = PdfUnreadable | TooManyPages
type InstructionsError = (
    InstructionsMissing | FileTooLarge | PdfError | InvalidPageRange | NoTextInPdf | TextError
)
