"""The planner (spec 0006, The planner): one validated tool call plus the saved state become
an ordered list of lifecycle operations and one reply reason. Pure.

Every value is grounded in the sentence, cut to the user's own words, and converted by code
before it can reach an operation; the model never picks the card or writes a reply.
"""

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace

from app.ai.tools import (
    Confirmar,
    Corregir,
    Descartar,
    ElegirEnsayo,
    ExtractedValue,
    PedirAclaracion,
    ProponerMedicion,
    ToolCall,
)
from app.models.enums import Grounding
from app.services.card_state import (
    CardInfo,
    ValueInfo,
    VariableInfo,
    by_id,
    can_confirm,
    card_reason,
)
from app.services.numbers import Said, find_numbers, ground, said_slice
from app.services.replies import Reason
from app.services.units import UnknownUnit, normalize

_ARTICLES = frozenset({"un", "una", "uno"})


@dataclass(frozen=True, slots=True)
class TurnContext:
    """What the planner and the prompt see, read in one database pass before the model call."""

    experiment_id: int
    variables: tuple[VariableInfo, ...]
    card: CardInfo | None
    trial_numbers: Mapping[int, int]  # saved trial number → trial id
    last_turns: tuple[tuple[str, str], ...] = ()  # (role, text), oldest first


@dataclass(frozen=True, slots=True)
class StartProposal:
    trial_number: int | None


@dataclass(frozen=True, slots=True)
class SetTrial:
    """Set the card's number. It also clears a correction target (spec 0002's `set_trial`)."""

    trial_number: int | None


@dataclass(frozen=True, slots=True)
class SetTarget:
    trial_id: int


@dataclass(frozen=True, slots=True)
class SetValue:
    variable_id: int
    value: float  # in the variable's unit
    said_text: str
    grounding: Grounding


@dataclass(frozen=True, slots=True)
class Confirm:
    pass


@dataclass(frozen=True, slots=True)
class Discard:
    pass


type Operation = StartProposal | SetTrial | SetTarget | SetValue | Confirm | Discard


@dataclass(frozen=True, slots=True)
class TurnPlan:
    operations: tuple[Operation, ...]
    reason: Reason
    variable_ids: tuple[int, ...] = ()


@dataclass(frozen=True, slots=True)
class _Values:
    """The values that passed every check, and the first problem found with the others."""

    accepted: tuple[SetValue, ...]
    reason: Reason | None
    variable_ids: tuple[int, ...]
    used: frozenset[int]  # starts of the spans the values were read from


def _check_values(
    values: Sequence[ExtractedValue], variables: Mapping[int, VariableInfo], utterance: str
) -> _Values:
    """Step 1: ground, cut the said words, and normalize each value. Drops what fails."""
    problems: list[tuple[Reason, int | None]] = []
    counts = Counter(v.variable_id for v in values)
    candidates: list[ExtractedValue] = []
    for v in values:
        if v.variable_id not in variables:
            problems.append((Reason.AMBIGUOUS_VARIABLE, None))
        elif counts[v.variable_id] > 1:
            problems.append((Reason.AMBIGUOUS_VARIABLE, v.variable_id))
        else:
            candidates.append(v)

    # Each value takes the first span not used by another; one span read for two
    # variables drops both.
    taken: dict[int, int] = {}  # span start → variable id
    grounded: dict[int, tuple[ExtractedValue, Said, Grounding, float]] = {}
    for v in candidates:
        found = ground(utterance, v.number_text, v.value, taken)
        if found is None:
            clash = ground(utterance, v.number_text, v.value)
            if clash is not None and clash.span.start in taken:
                other = taken[clash.span.start]
                grounded.pop(other, None)
                problems.append((Reason.AMBIGUOUS_VARIABLE, other))
                problems.append((Reason.AMBIGUOUS_VARIABLE, v.variable_id))
            else:
                problems.append((Reason.UNCLEAR_NUMBER, v.variable_id))
            continue
        taken[found.span.start] = v.variable_id
        said = said_slice(utterance, found.span, variables[v.variable_id].unit)
        grounded[v.variable_id] = (v, said, found.grounding, found.span.value)

    accepted: list[SetValue] = []
    for variable_id, (v, said, grounding, number) in grounded.items():
        variable = variables[variable_id]
        converted = normalize(number, said.unit, variable.unit)
        if (v.unit_text and said.unit is None) or isinstance(converted, UnknownUnit):
            problems.append((Reason.UNKNOWN_UNIT, variable_id))
            continue
        accepted.append(SetValue(variable_id, converted, said.text, grounding))

    used = frozenset(taken)
    if not problems:
        return _Values(tuple(accepted), None, (), used)
    first = problems[0][0]
    ids = tuple(dict.fromkeys(i for r, i in problems if r == first and i is not None))
    return _Values(tuple(accepted), first, ids, used)


def _unplaced_number(utterance: str, used: frozenset[int]) -> bool:
    """A number the user said that no value was read from ("ensayo 6, cincuenta"). A lone
    "un" or "una" is an article as often as a number, so it never counts."""
    return any(
        not span.is_trial
        and span.start not in used
        and utterance[span.start : span.end].lower() not in _ARTICLES
        for span in find_numbers(utterance)
    )


def _open_variables(context: TurnContext) -> tuple[int, ...]:
    """Candidates for a number with no variable: those still empty on the card, else all."""
    ordered = sorted(context.variables, key=lambda v: v.position)
    card = context.card
    empty = tuple(v.id for v in ordered if card is None or card.value_of(v.id) is None)
    return empty or tuple(v.id for v in ordered)


def _said_trial_number(trial_number: int | None, utterance: str) -> int | None:
    """A trial number that is not among the sentence's numbers is treated as not said."""
    if trial_number is None or trial_number <= 0:
        return None
    said = any(span.value == trial_number for span in find_numbers(utterance))
    return trial_number if said else None


def _measurement_ops(
    card: CardInfo | None, trial_number: int | None, values: tuple[SetValue, ...]
) -> tuple[tuple[Operation, ...], Reason | None]:
    """Step 2: where `proponer_medicion` puts its trial number and values."""
    if card is None:
        if trial_number is None and not values:
            return (), None
        return (StartProposal(trial_number), *values), None
    if trial_number is None or trial_number == card.trial_number:
        return values, None
    if card.trial_number is not None and card.values:
        return (), Reason.PENDING_OTHER_TRIAL
    # A card with no number yet, in choose_trial, or with no values takes the new number
    # (SetTrial also clears a correction target).
    return (SetTrial(trial_number), *values), None


def _apply(
    card: CardInfo | None, ops: Sequence[Operation], trial_numbers: Mapping[int, int]
) -> CardInfo | None:
    """The card as the operations would leave it, to work out the reply."""
    numbers_by_id = {trial_id: number for number, trial_id in trial_numbers.items()}
    for op in ops:
        match op:
            case StartProposal(trial_number=n):
                card = CardInfo(id=None, trial_number=n, target_trial_id=None)
            case _ if card is None:
                pass
            case SetTrial(trial_number=n):
                card = _retarget(card, None, n)
            case SetTarget(trial_id=trial_id):
                card = _retarget(card, trial_id, numbers_by_id.get(trial_id, card.trial_number))
            case SetValue(variable_id=vid, value=value, said_text=said, grounding=grounding):
                kept = tuple(v for v in card.values if v.variable_id != vid)
                new = ValueInfo(vid, value, said, grounding, checked=False)
                card = replace(card, values=(*kept, new))
            case Confirm() | Discard():
                pass
    return card


def _retarget(card: CardInfo, target: int | None, number: int | None) -> CardInfo:
    """A changed target clears every check on the card (AC-24)."""
    values = (
        card.values
        if target == card.target_trial_id
        else tuple(replace(v, checked=False) for v in card.values)
    )
    return replace(card, target_trial_id=target, trial_number=number, values=values)


def _with_state_reason(
    context: TurnContext,
    ops: tuple[Operation, ...],
    reason: Reason | None = None,
    variable_ids: tuple[int, ...] = (),
) -> TurnPlan:
    """Step 6: a reason from steps 1 to 5 wins; otherwise the card's own question."""
    if reason is not None:
        return TurnPlan(ops, reason, variable_ids)
    card = _apply(context.card, ops, context.trial_numbers)
    if card is None:
        return TurnPlan(ops, Reason.AMBIGUOUS_VARIABLE)
    state, ids = card_reason(card, context.variables, context.trial_numbers)
    return TurnPlan(ops, state, ids)


def plan_turn(context: TurnContext, call: ToolCall, utterance: str) -> TurnPlan:
    card = context.card
    variables = by_id(context.variables)
    match call:
        case ProponerMedicion() | Corregir():
            checked = _check_values(call.values, variables, utterance)
            if isinstance(call, Corregir) and card is not None:
                trial_number = None
            else:
                trial_number = _said_trial_number(
                    call.trial_number if isinstance(call, ProponerMedicion) else None, utterance
                )
            ops, other = _measurement_ops(card, trial_number, checked.accepted)
            if other is not None:
                return TurnPlan((), other)
            reason, ids = checked.reason, checked.variable_ids
            if reason is None and _unplaced_number(utterance, checked.used):
                reason, ids = Reason.AMBIGUOUS_VARIABLE, _open_variables(context)
            if not ops and reason is None and card is None:
                return TurnPlan((), Reason.OFF_TOPIC)
            return _with_state_reason(context, ops, reason, ids)
        case ElegirEnsayo(kind=kind, trial_number=n):
            if card is None:
                return TurnPlan((), Reason.NO_PENDING)
            if kind == "correccion":
                trial_id = (
                    context.trial_numbers.get(card.trial_number)
                    if card.trial_number is not None
                    else None
                )
                ops: tuple[Operation, ...] = () if trial_id is None else (SetTarget(trial_id),)
                return _with_state_reason(context, ops)
            return _with_state_reason(context, (SetTrial(_said_trial_number(n, utterance)),))
        case Confirmar():
            if card is None:
                return TurnPlan((), Reason.NO_PENDING)
            # "sí, ensayo 7" carries numbers: never a confirm, just the card's question.
            if find_numbers(utterance) or not can_confirm(
                card, context.variables, context.trial_numbers
            ):
                return _with_state_reason(context, ())
            return TurnPlan((Confirm(),), Reason.SAVED)
        case Descartar():
            if card is None:
                return TurnPlan((), Reason.NO_PENDING)
            return TurnPlan((Discard(),), Reason.DISCARDED)
        case PedirAclaracion(reason=reason, variable_ids=ids):
            if reason != "ambiguous_variable":
                return TurnPlan((), Reason(reason))
            known = tuple(i for i in dict.fromkeys(ids) if i in variables)
            return TurnPlan((), Reason.AMBIGUOUS_VARIABLE, known or _open_variables(context))
