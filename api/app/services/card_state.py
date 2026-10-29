"""The pending card as plain data, and the rules worked out from it (spec 0006, AC-17 and
AC-24). Pure: the planner and the card view both read the card through these."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.models.enums import Grounding
from app.services.flags import flags, unchecked
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


@dataclass(frozen=True, slots=True)
class RememberedTrial:
    """The trial of the notebook's latest save: where a sentence with no trial number goes,
    as a correction (spec 0006, AC-31)."""

    trial_id: int
    number: int
    filled: frozenset[int]  # variable ids the trial already holds a value for


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


def is_clean(
    card: CardInfo,
    variables: Sequence[VariableInfo],
    trial_numbers: Mapping[int, int],
    remembered: RememberedTrial | None,
) -> bool:
    """Whether code may save the card with no tap (spec 0006, AC-27): a new trial number,
    or only empty slots of the remembered trial; every required variable filled; and no
    value flagged. The model's confidence plays no part."""
    if card.trial_number is None or not card.values:
        return False
    already: frozenset[int] = frozenset()
    if card.target_trial_id is None:
        if card.trial_number in trial_numbers:
            return False
    elif remembered is None or card.target_trial_id != remembered.trial_id:
        return False
    elif any(v.variable_id in remembered.filled for v in card.values):
        return False  # it would replace a saved value: the correction card asks
    else:
        already = remembered.filled
    known = by_id(variables)
    if any(v.required and v.id not in already and card.value_of(v.id) is None for v in variables):
        return False
    return not any(v.variable_id in known and flags(v, known[v.variable_id]) for v in card.values)


def can_confirm(
    card: CardInfo, variables: Sequence[VariableInfo], trial_numbers: Mapping[int, int]
) -> bool:
    return (
        bool(card.values)
        and card.trial_number is not None
        and not is_choose_trial(card, trial_numbers)
        and not unchecked_ids(card, variables)
    )
