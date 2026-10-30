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
    """The trial of the notebook's latest save: where a sentence with no trial number goes
    (spec 0006, AC-31; spec 0011, AC-7)."""

    trial_id: int
    number: int


type Slots = Mapping[int, float]  # variable id → the value saved on a trial


def by_id(variables: Sequence[VariableInfo]) -> Mapping[int, VariableInfo]:
    return {v.id: v for v in variables}


def slots_of(card: CardInfo, saved: Mapping[int, Slots]) -> Slots:
    """The saved values of the card's trial; empty for a trial not saved yet."""
    return saved.get(card.trial_number, {}) if card.trial_number is not None else {}


def _flagged(value: ValueInfo, known: Mapping[int, VariableInfo]) -> bool:
    return value.variable_id in known and bool(flags(value, known[value.variable_id]))


def unchecked_ids(
    card: CardInfo, variables: Sequence[VariableInfo], slots: Slots
) -> tuple[int, ...]:
    """Flagged values not checked yet. A value that replaces a saved one is never flagged:
    its "¿Cambio…?" is already its extra step (spec 0011, AC-6)."""
    return unchecked(card.values, by_id(variables), slots)


def replacing_ids(
    card: CardInfo, variables: Sequence[VariableInfo], slots: Slots
) -> tuple[int, ...]:
    """The card's values that would replace a saved value, in position order."""
    return tuple(
        v.id
        for v in sorted(variables, key=lambda v: v.position)
        if v.id in slots and card.value_of(v.id) is not None
    )


def card_reason(
    card: CardInfo, variables: Sequence[VariableInfo], slots: Slots
) -> tuple[Reason, tuple[int, ...]]:
    """The card's question from saved state, and the variable ids it names (spec 0011,
    AC-15). Required variables play no part (AC-2)."""
    if card.trial_number is None:
        return Reason.MISSING_TRIAL, ()
    if not card.values:
        return Reason.TRIAL_SELECTED, ()
    if pending_checks := unchecked_ids(card, variables, slots):
        return Reason.CHECK_VALUES, pending_checks
    if replacing := replacing_ids(card, variables, slots):
        return Reason.CONFIRM_CHANGE, replacing
    return Reason.READY, ()


def split_values(
    card: CardInfo, variables: Sequence[VariableInfo], slots: Slots
) -> tuple[tuple[ValueInfo, ...], tuple[ValueInfo, ...]]:
    """The clean rule (spec 0011, AC-12): a value saves with no tap when it fills an empty
    slot of its trial and is not flagged. Returns (clean, waiting). The model's confidence
    and required variables play no part; checking a flag by hand does not make it clean."""
    known = by_id(variables)
    clean = tuple(v for v in card.values if v.variable_id not in slots and not _flagged(v, known))
    waiting = tuple(v for v in card.values if v not in clean)
    return clean, waiting


def can_confirm(card: CardInfo, variables: Sequence[VariableInfo], slots: Slots) -> bool:
    return (
        bool(card.values)
        and card.trial_number is not None
        and not unchecked_ids(card, variables, slots)
    )
