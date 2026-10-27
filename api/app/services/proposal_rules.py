"""Pure rules of the proposal lifecycle (spec 0002). Given rows the repository already
loaded and locked, decide the next step or the typed error. No I/O here."""

import math
from dataclasses import dataclass

from app.models import Proposal, Trial, Turn, Variable
from app.models.enums import ProposalStatus, Role
from app.services.results import (
    Confirmed,
    EmptyProposal,
    InvalidTrialNumber,
    InvalidTurn,
    InvalidValue,
    MissingTrialNumber,
    NotPending,
    PendingError,
    ProposalNotFound,
    TrialNotInExperiment,
    VariableNotInExperiment,
)


@dataclass(frozen=True, slots=True)
class UseTrial:
    """Write into this saved trial (a correction, RN-02)."""

    trial_id: int


@dataclass(frozen=True, slots=True)
class CreateTrial:
    """Insert a new trial with this number, unless the number is already taken."""

    number: int


@dataclass(frozen=True, slots=True)
class ValueSources:
    """The checked rows a proposal value is copied from."""

    variable: Variable
    turn: Turn


type ConfirmPlan = (
    Confirmed | UseTrial | CreateTrial | NotPending | EmptyProposal | MissingTrialNumber
)


def check_trial_number(number: int | None) -> int | InvalidTrialNumber | None:
    """No number yet is fine; a given one must be above zero (the CHECK is the backstop)."""
    if number is not None and number <= 0:
        return InvalidTrialNumber()
    return number


def check_value(value: float) -> float | InvalidValue:
    if not math.isfinite(value):
        return InvalidValue()
    return value


def check_pending(proposal: Proposal | None) -> Proposal | PendingError:
    if proposal is None:
        return ProposalNotFound()
    if proposal.status != ProposalStatus.PENDING:
        return NotPending()
    return proposal


def check_target_trial(proposal: Proposal, trial: Trial | None) -> Trial | TrialNotInExperiment:
    if trial is None or trial.experiment_id != proposal.experiment_id:
        return TrialNotInExperiment()
    return trial


def check_value_sources(
    proposal: Proposal, variable: Variable | None, turn: Turn | None
) -> ValueSources | VariableNotInExperiment | InvalidTurn:
    """The variable and the turn a value comes from must belong to the proposal's experiment,
    and the turn must be something the user said."""
    if variable is None or variable.experiment_id != proposal.experiment_id:
        return VariableNotInExperiment()
    if turn is None or turn.experiment_id != proposal.experiment_id or turn.role != Role.USER:
        return InvalidTurn()
    return ValueSources(variable=variable, turn=turn)


def plan_confirm(proposal: Proposal, value_count: int) -> ConfirmPlan:
    """Steps 2 to 4 of confirm. A repeat confirm returns the stored result (AC-4)."""
    if proposal.status == ProposalStatus.CONFIRMED and proposal.confirmed_trial_id is not None:
        return Confirmed(trial_id=proposal.confirmed_trial_id, created_trial=False)
    if proposal.status != ProposalStatus.PENDING:
        # Discarded, superseded, or confirmed into a trial that was deleted later.
        return NotPending()
    if value_count == 0:
        return EmptyProposal()
    if proposal.target_trial_id is not None:
        return UseTrial(trial_id=proposal.target_trial_id)
    if proposal.trial_number is None:
        return MissingTrialNumber()
    return CreateTrial(number=proposal.trial_number)
