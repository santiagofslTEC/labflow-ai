"""The planner (spec 0006, The planner): one validated tool call plus the saved state become
an ordered list of lifecycle operations and one reply reason. Pure.

Every value is grounded in the sentence, cut to the user's own words, and converted by code
before it can reach an operation; the model never picks the card or writes a reply.
"""

import re
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
    RememberedTrial,
    ValueInfo,
    VariableInfo,
    by_id,
    can_confirm,
    card_reason,
    is_clean,
)
from app.services.numbers import Said, Span, find_numbers, ground, said_slice
from app.services.replies import Reason
from app.services.text import fold
from app.services.units import UnknownUnit, normalize

_ARTICLES = frozenset({"un", "una", "uno"})
# Words a short answer may carry around its one number ("el 5", "es el ensayo 5").
_FILLER = frozenset({"el", "es", "la", "ensayo", "prueba", "corrida", "numero", "nro"})
# A yes: every word in _YES_WORDS, and at least one of _YES ("sí", "sí, es esa", "correcto").
_YES = frozenset({"si", "claro", "correcto", "exacto", "eso"})
_YES_WORDS = _YES | frozenset({"es", "esa", "ese", "asi"})
_WORD = re.compile(r"[a-zñ0-9]+")


@dataclass(frozen=True, slots=True)
class LastQuestion:
    """LabFlow's previous reply and the user sentence it answered, so a short answer to it
    ("5", "71", "sí") is planned by code against that question (spec 0006, Short answers)."""

    reason: Reason
    variable_ids: tuple[int, ...]  # the variables the reply named
    sentence: str
    sentence_turn_id: int


@dataclass(frozen=True, slots=True)
class TurnContext:
    """What the planner and the prompt see, read in one database pass before the model call."""

    experiment_id: int
    variables: tuple[VariableInfo, ...]
    card: CardInfo | None
    trial_numbers: Mapping[int, int]  # saved trial number → trial id
    last_turns: tuple[tuple[str, str], ...] = ()  # (role, text), oldest first
    context: str | None = None  # the notebook's "Contexto para la captura" (spec 0005, AC-26)
    last_question: LastQuestion | None = None
    remembered: RememberedTrial | None = None  # the latest saved trial (AC-31)


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
    turn_id: int | None = None  # the sentence it was read from, when not this turn's


@dataclass(frozen=True, slots=True)
class Confirm:
    auto: bool = False  # code found the card clean and saves it with no tap (AC-27)


@dataclass(frozen=True, slots=True)
class Discard:
    pass


type Operation = StartProposal | SetTrial | SetTarget | SetValue | Confirm | Discard


@dataclass(frozen=True, slots=True)
class TurnPlan:
    operations: tuple[Operation, ...]
    reason: Reason
    variable_ids: tuple[int, ...] = ()
    said: tuple[str, ...] = ()  # `two_values`: the user's words for each value, in order


@dataclass(frozen=True, slots=True)
class _Values:
    """The values that passed every check, and the first problem found with the others."""

    accepted: tuple[SetValue, ...]
    reason: Reason | None
    variable_ids: tuple[int, ...]
    used: frozenset[int]  # starts of the spans the values were read from
    said: tuple[str, ...] = ()


def _said_values(
    values: Sequence[ExtractedValue], variable: VariableInfo, utterance: str
) -> tuple[str, ...]:
    """The user's own words for each value of one variable, one per span, in sentence order."""
    spans = {
        found.span.start: found.span
        for v in values
        if (found := ground(utterance, v.number_text, v.value)) is not None
    }
    return tuple(said_slice(utterance, spans[start], variable.unit).text for start in sorted(spans))


def _check_values(
    values: Sequence[ExtractedValue], variables: Mapping[int, VariableInfo], utterance: str
) -> _Values:
    """Step 1: ground, cut the said words, and normalize each value. Drops what fails."""
    problems: list[tuple[Reason, int | None]] = []
    counts = Counter(v.variable_id for v in values)
    candidates: list[ExtractedValue] = []
    two_values: dict[int, tuple[str, ...]] = {}  # variable id → its said words
    for v in values:
        if v.variable_id not in variables:
            problems.append((Reason.AMBIGUOUS_VARIABLE, None))
        elif counts[v.variable_id] > 1:
            if v.variable_id in two_values:
                continue
            same = [w for w in values if w.variable_id == v.variable_id]
            said = _said_values(same, variables[v.variable_id], utterance)
            # Two numbers the user said for one variable: ask which (never pick one).
            two_values[v.variable_id] = said
            problems.append(
                (Reason.TWO_VALUES if len(said) > 1 else Reason.AMBIGUOUS_VARIABLE, v.variable_id)
            )
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
    first, first_id = problems[0]
    if first == Reason.TWO_VALUES and first_id is not None:
        return _Values(tuple(accepted), first, (first_id,), used, two_values[first_id])
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


def _placed_trial(
    trial_number: int | None, utterance: str, values: tuple[SetValue, ...], used: frozenset[int]
) -> tuple[int | None, frozenset[int]]:
    """One number is the trial or a value, never both (AC-36). A trial number with no trial
    word before it is kept only beside an accepted value, and then its number counts as placed;
    alone it is ignored, so a lone number still asks which variable."""
    said = _said_trial_number(trial_number, utterance)
    if said is None:
        return None, used
    spans = [s for s in find_numbers(utterance) if s.value == said and s.start not in used]
    if not spans or any(s.is_trial for s in spans):
        return said, used
    if not values:
        return None, used
    return said, used | {spans[0].start}


def _measurement_ops(
    context: TurnContext, trial_number: int | None, values: tuple[SetValue, ...]
) -> tuple[tuple[Operation, ...], Reason | None]:
    """Step 2: where `proponer_medicion` puts its trial number and values. With no card and
    no number, values go to the remembered trial as a correction of it (AC-31)."""
    card, remembered = context.card, context.remembered
    if card is None:
        if trial_number is None and not values:
            return (), None
        if trial_number is None and remembered is not None:
            return (
                StartProposal(remembered.number),
                SetTarget(remembered.trial_id),
                *values,
            ), None
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
    said: tuple[str, ...] = (),
) -> TurnPlan:
    """Step 6: a reason from steps 1 to 5 wins; then a clean card that this turn changed is
    saved with no tap (AC-27); otherwise the card's own question."""
    if reason is not None:
        return TurnPlan(ops, reason, variable_ids, said)
    card = _apply(context.card, ops, context.trial_numbers)
    if card is None:
        return TurnPlan(ops, Reason.AMBIGUOUS_VARIABLE)
    if ops and is_clean(card, context.variables, context.trial_numbers, context.remembered):
        return TurnPlan((*ops, Confirm(auto=True)), Reason.AUTO_SAVED)
    state, ids = card_reason(card, context.variables, context.trial_numbers)
    return TurnPlan(ops, state, ids)


def _only_number(utterance: str, own_unit: str | None = None) -> Span | None:
    """The one number of a short answer: nothing else is said but filler words and the unit
    words right after the number ("5", "el 5", "71 grados")."""
    spans = find_numbers(utterance)
    if len(spans) != 1:
        return None
    span = spans[0]
    end = span.start + len(said_slice(utterance, span, own_unit).text)
    rest = fold(utterance[: span.start] + " " + utterance[end:])
    return span if all(word in _FILLER for word in _WORD.findall(rest)) else None


def _is_yes(utterance: str) -> bool:
    words = _WORD.findall(fold(utterance))
    return bool(words) and set(words) <= _YES_WORDS and not _YES.isdisjoint(words)


def _unplaced_in(asked: LastQuestion, card: CardInfo | None) -> Span | None:
    """The one number of the asked about sentence that no value on the card was read from."""
    placed = [
        v.said_text
        for v in (card.values if card else ())
        if v.turn_id == asked.sentence_turn_id and v.said_text
    ]
    open_spans = [
        span
        for span in find_numbers(asked.sentence)
        if not span.is_trial
        and asked.sentence[span.start : span.end].lower() not in _ARTICLES
        and not any(asked.sentence.startswith(said, span.start) for said in placed)
    ]
    return open_spans[0] if len(open_spans) == 1 else None


def _trial_in(sentence: str) -> int | None:
    """The trial number said in `sentence` ("ensayo 20"), when it says exactly one."""
    numbers = {
        int(span.value)
        for span in find_numbers(sentence)
        if span.is_trial and span.value.is_integer() and span.value > 0
    }
    return next(iter(numbers)) if len(numbers) == 1 else None


def _set_from(
    context: TurnContext,
    variable_id: int,
    span: Span,
    sentence: str,
    turn_id: int | None,
    trial_number: int | None = None,
) -> TurnPlan:
    """One value read by code from `span` of `sentence`, checked like a model value.
    `trial_number` starts the card when none is pending (AC-35)."""
    value = ExtractedValue(
        variable_id=variable_id, number_text=sentence[span.start : span.end], value=span.value
    )
    checked = _check_values([value], by_id(context.variables), sentence)
    accepted = tuple(replace(v, turn_id=turn_id) for v in checked.accepted)
    trial = trial_number if context.card is None else None
    ops, other = _measurement_ops(context, trial, accepted)
    if other is not None:
        return TurnPlan((), other)
    return _with_state_reason(context, ops, checked.reason, checked.variable_ids)


def _short_answer(context: TurnContext, utterance: str) -> TurnPlan | None:
    """A short answer to the question LabFlow just asked, planned by code whatever the model
    read (spec 0006, Short answers). None when the sentence is not one."""
    asked = context.last_question
    if asked is None:
        return None
    card = context.card
    variables = by_id(context.variables)
    one_variable = asked.variable_ids[0] if len(asked.variable_ids) == 1 else None
    match asked.reason:
        case Reason.MISSING_TRIAL if card is not None and card.trial_number is None:
            span = _only_number(utterance)
            if span is None or not span.value.is_integer() or span.value <= 0:
                return None
            return _with_state_reason(context, (SetTrial(int(span.value)),))
        case Reason.TWO_VALUES if one_variable is not None and one_variable in variables:
            span = _only_number(utterance, variables[one_variable].unit)
            if span is None or span.is_trial:
                return None
            return _set_from(context, one_variable, span, utterance, None)
        case Reason.AMBIGUOUS_VARIABLE if one_variable is not None and one_variable in variables:
            # Either answer lands on the trial the asked sentence named (AC-35).
            trial = _trial_in(asked.sentence)
            if _is_yes(utterance):
                span = _unplaced_in(asked, card)
                if span is None:
                    return None
                return _set_from(
                    context, one_variable, span, asked.sentence, asked.sentence_turn_id, trial
                )
            span = _only_number(utterance, variables[one_variable].unit)
            if span is None or span.is_trial:
                return None
            return _set_from(context, one_variable, span, utterance, None, trial)
        case _:
            return None


def plan_turn(context: TurnContext, call: ToolCall, utterance: str) -> TurnPlan:
    if (short := _short_answer(context, utterance)) is not None:
        return short
    card = context.card
    variables = by_id(context.variables)
    match call:
        case ProponerMedicion() | Corregir():
            checked = _check_values(call.values, variables, utterance)
            used = checked.used
            if isinstance(call, Corregir) and card is not None:
                trial_number = None
            else:
                trial_number, used = _placed_trial(
                    call.trial_number if isinstance(call, ProponerMedicion) else None,
                    utterance,
                    checked.accepted,
                    used,
                )
            ops, other = _measurement_ops(context, trial_number, checked.accepted)
            if other is not None:
                return TurnPlan((), other)
            reason, ids = checked.reason, checked.variable_ids
            if reason is None and _unplaced_number(utterance, used):
                reason, ids = Reason.AMBIGUOUS_VARIABLE, _open_variables(context)
            if not ops and reason is None and card is None:
                return TurnPlan((), Reason.OFF_TOPIC)
            return _with_state_reason(context, ops, reason, ids, checked.said)
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
