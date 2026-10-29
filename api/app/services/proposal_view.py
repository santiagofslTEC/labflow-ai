"""The card as the API returns it (spec 0006, `ProposalView`), built from saved state only,
so a reload shows the card where it was (AC-17). Pure."""

from collections.abc import Mapping, Sequence

from pydantic import BaseModel, ConfigDict

from app.models.enums import Source
from app.services.card_state import (
    CardInfo,
    VariableInfo,
    by_id,
    can_confirm,
    card_reason,
)
from app.services.flags import FlagReason, flag_text, flags, interpreted
from app.services.replies import Reason, reply_text


class _View(BaseModel):
    model_config = ConfigDict(frozen=True)


class Reply(_View):
    reason: Reason
    text: str


class FlagView(_View):
    reason: FlagReason
    text: str


class ValueView(_View):
    variable_id: int
    name: str
    unit: str | None
    value: float | None  # None: nothing said yet for this variable
    previous: float | None  # the saved value in a correction, else None
    said_text: str | None  # the user's own words; None for a hand edit
    interpreted: bool
    flags: list[FlagView]
    checked: bool


class SavedValue(_View):
    """One value a save wrote, for the notice of an auto save (spec 0006, AC-28)."""

    variable_id: int
    name: str
    value: float
    unit: str | None


class ProposalView(_View):
    id: int
    trial_number: int | None
    target_trial_id: int | None
    values: list[ValueView]  # every variable, by position
    phrase: str
    source: Source
    flagged: bool
    question: Reply
    can_confirm: bool


def reply_for(
    reason: Reason,
    variable_ids: Sequence[int],
    variables: Sequence[VariableInfo],
    n: int | None,
    said: Sequence[str] = (),
) -> Reply:
    """The template text for a reason, with names and the unit taken from the variables."""
    known = by_id(variables)
    named = [known[i] for i in variable_ids if i in known]
    unit = named[0].unit if named else None
    return Reply(reason=reason, text=reply_text(reason, [v.name for v in named], n, unit, said))


def proposal_view(
    card: CardInfo,
    variables: Sequence[VariableInfo],
    trial_numbers: Mapping[int, int],
    previous: Mapping[int, float],
    phrase: str,
    source: Source,
) -> ProposalView:
    assert card.id is not None  # only saved cards are shown
    correction = card.target_trial_id is not None
    rows: list[ValueView] = []
    for variable in sorted(variables, key=lambda v: v.position):
        value = card.value_of(variable.id)
        reasons = () if value is None or correction else flags(value, variable)
        rows.append(
            ValueView(
                variable_id=variable.id,
                name=variable.name,
                unit=variable.unit,
                value=None if value is None else value.value,
                previous=previous.get(variable.id) if correction else None,
                said_text=None if value is None else value.said_text,
                interpreted=value is not None and interpreted(value.said_text, variable),
                flags=[
                    FlagView(reason=r, text=flag_text(r, value, variable))
                    for r in reasons
                    if value is not None
                ],
                checked=value is not None and value.checked,
            )
        )
    reason, ids = card_reason(card, variables, trial_numbers)
    return ProposalView(
        id=card.id,
        trial_number=card.trial_number,
        target_trial_id=card.target_trial_id,
        values=rows,
        phrase=phrase,
        source=source,
        flagged=any(row.flags for row in rows),
        question=reply_for(reason, ids, variables, card.trial_number),
        can_confirm=can_confirm(card, variables, trial_numbers),
    )
