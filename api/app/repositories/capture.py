"""Reads for capture (spec 0006): the turn context before the model call, and the card view
after the operations. Read only; every write goes through `proposals` and `turns`."""

from collections.abc import Mapping, Sequence

from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Proposal, ProposalValue, Trial, Turn, Variable
from app.models.enums import ProposalStatus, Role, Source
from app.repositories import proposals, turns
from app.services.card_state import (
    CardInfo,
    RememberedTrial,
    Slots,
    ValueInfo,
    VariableInfo,
    slots_of,
)
from app.services.proposal_view import ProposalView, SavedValue, proposal_view
from app.services.replies import Reason
from app.services.results import ExperimentNotFound
from app.services.turn_plan import LastQuestion, TurnContext

_REASONS = frozenset(r.value for r in Reason)


def _variables(session: Session, experiment_id: int) -> tuple[VariableInfo, ...]:
    rows = session.exec(
        select(Variable)
        .where(Variable.experiment_id == experiment_id)
        .order_by(col(Variable.position), col(Variable.id))
    ).all()
    return tuple(
        VariableInfo(
            id=v.id,
            name=v.name,
            unit=v.unit,
            required=v.required,
            position=v.position,
            min_value=v.min_value,
            max_value=v.max_value,
            aliases=tuple(v.aliases),
        )
        for v in rows
        if v.id is not None
    )


def _values(session: Session, proposal_id: int) -> Sequence[ProposalValue]:
    return session.exec(
        select(ProposalValue)
        .where(ProposalValue.proposal_id == proposal_id)
        .order_by(col(ProposalValue.id))
        .execution_options(populate_existing=True)
    ).all()


def card_info(session: Session, proposal: Proposal) -> CardInfo:
    assert proposal.id is not None
    return CardInfo(
        id=proposal.id,
        trial_number=proposal.trial_number,
        target_trial_id=proposal.target_trial_id,
        values=tuple(
            ValueInfo(
                variable_id=v.variable_id,
                value=v.value,
                said_text=v.said_text,
                grounding=v.grounding,
                checked=v.checked_at is not None,
                turn_id=v.turn_id,
            )
            for v in _values(session, proposal.id)
        ),
        updated_at=proposal.updated_at,
    )


def trial_numbers(session: Session, experiment_id: int) -> Mapping[int, int]:
    rows = session.exec(
        select(col(Trial.number), col(Trial.id)).where(Trial.experiment_id == experiment_id)
    ).all()
    return {number: trial_id for number, trial_id in rows if trial_id is not None}


def pending_card(session: Session, experiment_id: int) -> CardInfo | None:
    proposal = proposals.get_pending(session, experiment_id)
    return None if proposal is None else card_info(session, proposal)


def _last_question(rows: Sequence[Turn]) -> LastQuestion | None:
    """The reply before the sentence being planned (the last row), and the sentence that
    reply answered. None unless the three turns run user, assistant, user."""
    if len(rows) < 3:
        return None
    sentence, reply, current = rows[-3:]
    if (
        (sentence.role, reply.role, current.role) != (Role.USER, Role.ASSISTANT, Role.USER)
        or sentence.id is None
        or reply.tool_name not in _REASONS
    ):
        return None
    return LastQuestion(
        reason=Reason(reply.tool_name),
        variable_ids=tuple(reply.variable_ids or ()),
        sentence=sentence.text,
        sentence_turn_id=sentence.id,
    )


def _remembered(session: Session, experiment_id: int) -> RememberedTrial | None:
    """The trial of the notebook's latest confirmed or auto saved proposal (AC-31)."""
    trial_id = session.exec(
        select(col(Proposal.confirmed_trial_id))
        .where(Proposal.experiment_id == experiment_id)
        .where(Proposal.status == ProposalStatus.CONFIRMED)
        .where(col(Proposal.confirmed_trial_id).is_not(None))
        .order_by(col(Proposal.resolved_at).desc(), col(Proposal.id).desc())
    ).first()
    trial = session.get(Trial, trial_id) if trial_id is not None else None
    if trial is None or trial.id is None:
        return None
    return RememberedTrial(trial_id=trial.id, number=trial.number)


def saved_slots(session: Session, experiment_id: int) -> Mapping[int, Slots]:
    """Every trial's saved values, by trial number (spec 0011, Value sourcing): one query,
    since notebooks are small."""
    rows = session.exec(
        select(col(Trial.number), col(Measurement.variable_id), col(Measurement.value))
        .join(Measurement, col(Measurement.trial_id) == col(Trial.id))
        .where(Trial.experiment_id == experiment_id)
    ).all()
    saved: dict[int, dict[int, float]] = {}
    for number, variable_id, value in rows:
        saved.setdefault(number, {})[variable_id] = value
    return saved


def trial_number_of(session: Session, trial_id: int) -> int:
    trial = session.get(Trial, trial_id)
    assert trial is not None  # read right after the confirm that wrote it
    return trial.number


def saved_values(session: Session, proposal_id: int) -> list[SavedValue]:
    """The rows a proposal's confirm wrote, in variable position order."""
    rows = session.exec(
        select(Measurement, Variable)
        .join(Variable, col(Variable.id) == col(Measurement.variable_id))
        .where(Measurement.proposal_id == proposal_id)
        .order_by(col(Variable.position), col(Variable.id))
    ).all()
    return [
        SavedValue(variable_id=v.id, name=v.name, value=m.value, unit=v.unit)
        for m, v in rows
        if v.id is not None
    ]


def load_context(session: Session, experiment_id: int) -> TurnContext | ExperimentNotFound:
    """Everything the prompt and the planner see, read in one pass before the model call."""
    experiment = session.get(Experiment, experiment_id)
    if experiment is None:
        return ExperimentNotFound()
    recent = turns.last_turns(session, experiment_id)
    return TurnContext(
        experiment_id=experiment_id,
        variables=_variables(session, experiment_id),
        card=pending_card(session, experiment_id),
        trial_numbers=trial_numbers(session, experiment_id),
        last_turns=tuple((str(t.role), t.text) for t in recent),
        context=experiment.context,
        last_question=_last_question(recent),
        remembered=_remembered(session, experiment_id),
        saved=saved_slots(session, experiment_id),
    )


def _phrase(session: Session, experiment_id: int, card: CardInfo) -> tuple[str, Source]:
    """The latest user turn tied to the card's values, else the latest user turn."""
    turn_ids = [v.turn_id for v in card.values if v.turn_id is not None]
    turn = session.get(Turn, max(turn_ids)) if turn_ids else None
    if turn is None:
        turn = session.exec(
            select(Turn)
            .where(Turn.experiment_id == experiment_id)
            .where(Turn.role == Role.USER)
            .order_by(col(Turn.id).desc())
        ).first()
    if turn is None or turn.source is None:
        return "", Source.TEXT
    return turn.text, turn.source


def view_of(session: Session, experiment_id: int) -> ProposalView | None:
    """The pending card as the API shows it, from saved state only (AC-17)."""
    card = pending_card(session, experiment_id)
    if card is None:
        return None
    phrase, source = _phrase(session, experiment_id, card)
    return proposal_view(
        card,
        _variables(session, experiment_id),
        slots_of(card, saved_slots(session, experiment_id)),
        phrase,
        source,
    )


def experiment_exists(session: Session, experiment_id: int) -> bool:
    return session.get(Experiment, experiment_id) is not None


def variables_of(session: Session, experiment_id: int) -> tuple[VariableInfo, ...]:
    return _variables(session, experiment_id)
