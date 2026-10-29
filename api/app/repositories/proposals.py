"""The proposal lifecycle (spec 0002, API surface): start, set trial, set value, check a
value (spec 0006), confirm, discard. Each mutating function is one transaction. It locks its
row before any check, commits on success, and rolls back before returning a typed error, so
no lock stays open.

`proposals.confirm` is the only writer of `trial` and `measurement`.
"""

from collections.abc import Sequence

from sqlalchemy import tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Proposal, ProposalValue, Trial, Turn, Variable
from app.models.columns import utc_now
from app.models.enums import Grounding, ProposalStatus
from app.services.proposal_rules import (
    CreateTrial,
    UseTrial,
    ValueSources,
    check_pending,
    check_target_trial,
    check_trial_number,
    check_value_sources,
    plan_confirm,
)
from app.services.proposal_rules import (
    check_value as check_finite,
)
from app.services.results import (
    Confirmed,
    ConfirmError,
    ExperimentNotFound,
    InvalidTrialNumber,
    InvalidValue,
    PendingError,
    ProposalNotFound,
    SetTrialError,
    SetValueError,
    StartError,
    TrialExists,
    VariableNotInExperiment,
)


def get_pending(session: Session, experiment_id: int) -> Proposal | None:
    return session.exec(
        select(Proposal)
        .where(Proposal.experiment_id == experiment_id)
        .where(Proposal.status == ProposalStatus.PENDING)
        .execution_options(populate_existing=True)
    ).first()


def start_proposal(
    session: Session, experiment_id: int, trial_number: int | None
) -> Proposal | StartError:
    """Open a new card. The previous pending card, if any, becomes superseded (AC-6)."""
    if isinstance(checked := check_trial_number(trial_number), InvalidTrialNumber):
        return checked
    # The experiment lock serializes card starts even when no card is pending, so the
    # partial unique index stays a backstop that normal use never hits. It is
    # `FOR NO KEY UPDATE` so a concurrent confirm's trial insert (an FK key share on the
    # experiment) does not deadlock against it.
    experiment = session.exec(
        select(Experiment).where(Experiment.id == experiment_id).with_for_update(key_share=True)
    ).first()
    if experiment is None:
        session.rollback()
        return ExperimentNotFound()

    now = utc_now()
    # Locked and re-read: a card a concurrent confirm or discard just resolved is skipped.
    current = session.exec(
        select(Proposal)
        .where(Proposal.experiment_id == experiment_id)
        .where(Proposal.status == ProposalStatus.PENDING)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    if current is not None:
        current.status = ProposalStatus.SUPERSEDED
        current.resolved_at = now
        current.updated_at = now
        session.add(current)
        session.flush()  # free the one pending slot before the insert below

    proposal = Proposal(
        experiment_id=experiment_id, trial_number=trial_number, created_at=now, updated_at=now
    )
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    return proposal


def set_trial(
    session: Session, proposal_id: int, trial_number: int | None, target_trial_id: int | None
) -> Proposal | SetTrialError:
    """Set the dictated trial number, or point the card at a saved trial to correct it
    (RN-02). With a target, its number is copied so the two never disagree. Setting or
    clearing the target clears every check on the card (spec 0006, AC-24)."""
    proposal = check_pending(_lock_proposal(session, proposal_id))
    if not isinstance(proposal, Proposal):
        session.rollback()
        return proposal

    previous_target = proposal.target_trial_id
    if target_trial_id is None:
        if isinstance(checked := check_trial_number(trial_number), InvalidTrialNumber):
            session.rollback()
            return checked
        proposal.target_trial_id = None
        proposal.trial_number = trial_number
    else:
        target = check_target_trial(proposal, session.get(Trial, target_trial_id))
        if not isinstance(target, Trial):
            session.rollback()
            return target
        proposal.target_trial_id = target.id
        proposal.trial_number = target.number

    if proposal.target_trial_id != previous_target:
        session.exec(
            update(ProposalValue)
            .where(col(ProposalValue.proposal_id) == proposal_id)
            .values(checked_at=None)
        )
    proposal.updated_at = utc_now()
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    return proposal


def set_value(
    session: Session,
    proposal_id: int,
    variable_id: int,
    value: float,
    turn_id: int,
    said_text: str | None = None,
    grounding: Grounding | None = None,
) -> ProposalValue | SetValueError:
    """Put a value on the card, replacing any earlier value for the same variable (AC-5).
    The phrase, source, and time come from the turn; the unit from the variable.

    `said_text` and `grounding` are null for a hand edit, which counts as checked; a value
    set from a sentence starts unchecked (spec 0006, AC-24)."""
    if isinstance(checked := check_finite(value), InvalidValue):
        return checked
    proposal = check_pending(_lock_proposal(session, proposal_id))
    if not isinstance(proposal, Proposal):
        session.rollback()
        return proposal

    sources = check_value_sources(
        proposal, session.get(Variable, variable_id), session.get(Turn, turn_id)
    )
    if not isinstance(sources, ValueSources):
        session.rollback()
        return sources
    variable, turn = sources.variable, sources.turn

    stmt = insert(ProposalValue).values(
        proposal_id=proposal_id,
        variable_id=variable_id,
        value=value,
        unit=variable.unit,
        original_phrase=turn.text,
        source=turn.source,
        said_at=turn.created_at,
        turn_id=turn.id,
        said_text=said_text,
        grounding=grounding,
        checked_at=utc_now() if grounding is None else None,
    )
    replaced = (
        "value",
        "unit",
        "original_phrase",
        "source",
        "said_at",
        "turn_id",
        "said_text",
        "grounding",
        "checked_at",
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["proposal_id", "variable_id"],
        set_={name: stmt.excluded[name] for name in replaced},
    ).returning(col(ProposalValue.id))
    value_id: int = session.exec(stmt).scalar_one()

    proposal.updated_at = utc_now()
    session.add(proposal)
    session.commit()
    return session.exec(select(ProposalValue).where(ProposalValue.id == value_id)).one()


def check_value(
    session: Session, proposal_id: int, variable_id: int
) -> ProposalValue | PendingError | VariableNotInExperiment:
    """Mark a value as checked by the user (spec 0006, AC-24). A variable with no value on
    the card is reported as not in the experiment: there is nothing of it to check."""
    proposal = check_pending(_lock_proposal(session, proposal_id))
    if not isinstance(proposal, Proposal):
        session.rollback()
        return proposal

    row = session.exec(
        select(ProposalValue)
        .where(ProposalValue.proposal_id == proposal_id)
        .where(ProposalValue.variable_id == variable_id)
    ).first()
    if row is None:
        session.rollback()
        return VariableNotInExperiment()

    now = utc_now()
    row.checked_at = now
    proposal.updated_at = now
    session.add(row)
    session.add(proposal)
    session.commit()
    session.refresh(row)
    return row


def confirm(session: Session, proposal_id: int) -> Confirmed | ConfirmError:
    """Save the card: one trial and one measurement per value, in one transaction (AC-3).
    A repeat confirm returns the same trial and writes nothing (AC-4)."""
    proposal = _lock_proposal(session, proposal_id)
    if proposal is None:
        session.rollback()
        return ProposalNotFound()

    values = _values_of(session, proposal_id)
    plan = plan_confirm(proposal, len(values))
    match plan:
        case UseTrial(trial_id=trial_id):
            created_trial = False
        case CreateTrial(number=number):
            new_trial_id = _insert_trial(session, proposal.experiment_id, number)
            if new_trial_id is None:
                existing_id = _trial_id_by_number(session, proposal.experiment_id, number)
                session.rollback()
                return TrialExists(trial_id=existing_id)
            trial_id, created_trial = new_trial_id, True
        case _:
            session.rollback()
            return plan

    now = utc_now()
    _upsert_measurements(session, trial_id, proposal_id, values)
    proposal.status = ProposalStatus.CONFIRMED
    proposal.confirmed_trial_id = trial_id
    proposal.resolved_at = now
    proposal.updated_at = now
    session.add(proposal)
    session.commit()
    return Confirmed(trial_id=trial_id, created_trial=created_trial)


def discard(session: Session, proposal_id: int) -> Proposal | PendingError:
    """Drop the card. Nothing is saved (AC-10)."""
    proposal = check_pending(_lock_proposal(session, proposal_id))
    if not isinstance(proposal, Proposal):
        session.rollback()
        return proposal

    now = utc_now()
    proposal.status = ProposalStatus.DISCARDED
    proposal.resolved_at = now
    proposal.updated_at = now
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    return proposal


def _lock_proposal(session: Session, proposal_id: int) -> Proposal | None:
    """`SELECT … FOR UPDATE`, re-reading the row so a `not_pending` answer is never stale."""
    return session.exec(
        select(Proposal)
        .where(Proposal.id == proposal_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()


def _values_of(session: Session, proposal_id: int) -> Sequence[ProposalValue]:
    return session.exec(
        select(ProposalValue)
        .where(ProposalValue.proposal_id == proposal_id)
        .order_by(col(ProposalValue.id))
    ).all()


def _insert_trial(session: Session, experiment_id: int, number: int) -> int | None:
    """The new trial's id, or None when the number is already taken."""
    stmt = (
        insert(Trial)
        .values(experiment_id=experiment_id, number=number, created_at=utc_now())
        .on_conflict_do_nothing(index_elements=["experiment_id", "number"])
        .returning(col(Trial.id))
    )
    return session.exec(stmt).scalar_one_or_none()


def _trial_id_by_number(session: Session, experiment_id: int, number: int) -> int:
    trial_id = session.exec(
        select(col(Trial.id))
        .where(Trial.experiment_id == experiment_id)
        .where(Trial.number == number)
    ).one()
    assert trial_id is not None  # an identity column read back is never null
    return trial_id


def _upsert_measurements(
    session: Session, trial_id: int, proposal_id: int, values: Sequence[ProposalValue]
) -> None:
    """One row per value. An existing row is updated, and stamped `edited_at`, only when
    its value, unit, or phrase really changed; `confirmed_at` is set only on insert."""
    now = utc_now()
    stmt = insert(Measurement).values(
        [
            {
                "trial_id": trial_id,
                "variable_id": v.variable_id,
                "value": v.value,
                "unit": v.unit,
                "original_phrase": v.original_phrase,
                "source": v.source,
                "said_at": v.said_at,
                "turn_id": v.turn_id,
                "said_text": v.said_text,
                "proposal_id": proposal_id,
                "confirmed_at": now,
            }
            for v in values
        ]
    )
    new = stmt.excluded
    replaced = (
        "value",
        "unit",
        "original_phrase",
        "source",
        "said_at",
        "turn_id",
        "said_text",
        "proposal_id",
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["trial_id", "variable_id"],
        set_={name: new[name] for name in replaced} | {"edited_at": now},
        where=tuple_(
            col(Measurement.value), col(Measurement.unit), col(Measurement.original_phrase)
        ).is_distinct_from(tuple_(new.value, new.unit, new.original_phrase)),
    )
    session.exec(stmt)
