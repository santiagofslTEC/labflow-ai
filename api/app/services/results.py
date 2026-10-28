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


type StartError = ExperimentNotFound | InvalidTrialNumber
type PendingError = ProposalNotFound | NotPending
type SetTrialError = PendingError | TrialNotInExperiment | InvalidTrialNumber
type SetValueError = PendingError | VariableNotInExperiment | InvalidTurn | InvalidValue
type ConfirmError = PendingError | EmptyProposal | MissingTrialNumber | TrialExists


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


class ExperimentDetail(_Result):
    """A notebook with its variables in `position` order (spec 0005, AC-16)."""

    id: int
    title: str
    goal: str | None
    status: ExperimentStatus
    created_by: str
    created_at: datetime
    variables: tuple[VariableDetail, ...]


class DuplicateVariableName(_Result):
    """Two variables share a name ignoring case. `name` is None when only the DB index caught it."""

    code: Literal["duplicate_variable_name"] = "duplicate_variable_name"
    name: str | None


class InvalidRange(_Result):
    """A variable's minimum is above its maximum."""

    code: Literal["invalid_range"] = "invalid_range"
    name: str


type NewExperimentError = DuplicateVariableName | InvalidRange
