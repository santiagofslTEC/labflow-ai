"""The pending card as plain data, and the rules worked out from it (spec 0006, AC-17 and
AC-24). Pure: the planner and the card view both read the card through these."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.models.enums import Grounding
from app.services.flags import unchecked
from app.services.replies import Reason


@dataclass(frozen=True, slots=True)
class VariableInfo:
    id: int
    name: str
    unit: str | None
    required: bool
    position: int
    min_value: float | None = None
    max_value: float | None = None
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ValueInfo:
    variable_id: int
    value: float
    said_text: str | None = None
    grounding: Grounding | None = None
    checked: bool = False
    turn_id: int | None = None


@dataclass(frozen=True, slots=True)
class CardInfo:
    """A pending proposal. `id` is None for a card the planner is about to start."""

    id: int | None
    trial_number: int | None
    target_trial_id: int | None
    values: tuple[ValueInfo, ...] = ()
    updated_at: datetime | None = None

    def value_of(self, variable_id: int) -> ValueInfo | None:
        return next((v for v in self.values if v.variable_id == variable_id), None)


def by_id(variables: Sequence[VariableInfo]) -> Mapping[int, VariableInfo]:
    return {v.id: v for v in variables}


def unchecked_ids(card: CardInfo, variables: Sequence[VariableInfo]) -> tuple[int, ...]:
    return unchecked(card.values, by_id(variables), card.target_trial_id is not None)


def is_choose_trial(card: CardInfo, trial_numbers: Mapping[int, int]) -> bool:
    """The number is already saved and the card does not say whether it is a correction."""
    return (
        card.trial_number is not None
        and card.trial_number in trial_numbers
        and card.target_trial_id is None
    )


def card_reason(
    card: CardInfo, variables: Sequence[VariableInfo], trial_numbers: Mapping[int, int]
) -> tuple[Reason, tuple[int, ...]]:
    """The card's question from saved state, and the variable ids it names (AC-17)."""
    if is_choose_trial(card, trial_numbers):
        return Reason.CHOOSE_TRIAL, ()
    if card.trial_number is None:
        return Reason.MISSING_TRIAL, ()
    ordered = sorted(variables, key=lambda v: v.position)
    if not card.values:
        return Reason.MISSING_VALUES, tuple(v.id for v in ordered)
    missing = tuple(v.id for v in ordered if v.required and card.value_of(v.id) is None)
    if missing:
        return Reason.MISSING_VALUES, missing
    if pending_checks := unchecked_ids(card, variables):
        return Reason.CHECK_VALUES, pending_checks
    return Reason.READY, ()


def can_confirm(
    card: CardInfo, variables: Sequence[VariableInfo], trial_numbers: Mapping[int, int]
) -> bool:
    return (
        bool(card.values)
        and card.trial_number is not None
        and not is_choose_trial(card, trial_numbers)
        and not unchecked_ids(card, variables)
    )
