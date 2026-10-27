"""Typed results of the proposal lifecycle (spec 0002, API surface).

Expected failures are values, never exceptions. Each carries the snake_case `code` the
router edge puts in the API error shape; the Spanish message is added there.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict


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


class TrialExists(_Result):
    """The dictated trial number is already saved; ask whether it is a correction (RN-02)."""

    code: Literal["trial_exists"] = "trial_exists"
    trial_id: int


type PendingError = ProposalNotFound | NotPending
type SetTrialError = PendingError | TrialNotInExperiment
type SetValueError = PendingError | VariableNotInExperiment | InvalidTurn
type ConfirmError = PendingError | EmptyProposal | MissingTrialNumber | TrialExists
