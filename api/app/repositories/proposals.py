"""The proposal lifecycle (spec 0002, API surface): start, set trial, set value, check a
value (spec 0006), confirm, save now and undo (spec 0011), discard. Each mutating function is
one transaction. It locks its row before any check, commits on success, and rolls back before
returning a typed error, so no lock stays open.

A capture turn runs several of them as one transaction (spec 0011, the split): it passes
`commit=False`, so each only flushes, and the turn commits once at the end. A typed error
still rolls back, which then takes the whole turn back.

`confirm` and `save_now` are the only writers of `trial` and `measurement`.
"""

from collections.abc import Iterable, Sequence

from sqlalchemy import delete, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Proposal, ProposalValue, Trial, Turn, Variable
from app.models.columns import utc_now
from app.models.enums import Grounding, ProposalStatus, Role
from app.services.card_state import ValueInfo
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
    NotAutoSaved,
    PendingError,
    ProposalNotFound,
    SavedNow,
    SetTrialError,
    SetValueError,
    StartError,
    TrialExists,
    UndoError,
    UndoExpired,
    Undone,
    VariableNotInExperiment,
)


def _done(session: Session, commit: bool) -> None:
    """Commit, or inside a turn's transaction only flush (spec 0011)."""
    if commit:
        session.commit()
    else:
        session.flush()


def get_pending(session: Session, experiment_id: int) -> Proposal | None:
    return session.exec(
        select(Proposal)
        .where(Proposal.experiment_id == experiment_id)
        .where(Proposal.status == ProposalStatus.PENDING)
        .execution_options(populate_existing=True)
    ).first()


def start_proposal(
    session: Session, experiment_id: int, trial_number: int | None, *, commit: bool = True
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
    _done(session, commit)
    session.refresh(proposal)
    return proposal


def set_trial(
    session: Session,
    proposal_id: int,
    trial_number: int | None,
    target_trial_id: int | None,
    *,
    commit: bool = True,
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
    _done(session, commit)
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
    *,
    commit: bool = True,
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
    _done(session, commit)
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


def confirm(
    session: Session, proposal_id: int, saved_by: str | None = None, *, commit: bool = True
) -> Confirmed | ConfirmError:
    """Save the card: one trial and one measurement per value, in one transaction (AC-3).
    A repeat confirm returns the same trial and writes nothing (AC-4). Each row records
    `saved_by` (spec 0006, AC-30). A save with no tap goes through `save_now` instead."""
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
    _upsert_measurements(session, trial_id, proposal_id, values, saved_by)
    proposal.status = ProposalStatus.CONFIRMED
    proposal.confirmed_trial_id = trial_id
    proposal.resolved_at = now
    proposal.updated_at = now
    session.add(proposal)
    _done(session, commit)
    return Confirmed(trial_id=trial_id, created_trial=created_trial)


def save_now(
    session: Session,
    experiment_id: int,
    trial_number: int,
    values: Sequence[ValueInfo],
    saved_by: str,
    *,
    commit: bool = True,
) -> SavedNow:
    """Save clean values with no tap (spec 0011, AC-1, AC-12): straight into a `confirmed`
    proposal, never through `pending`. The trial is created, or added to when the number is
    saved (also when another tab created it in between). Measurements are insert only, so a
    slot filled in between is never replaced: its value is `skipped`, for the caller to ask
    about. Each value carries the id of the user turn it was read from."""
    trial_id = _insert_trial(session, experiment_id, trial_number)
    created = trial_id is not None
    if trial_id is None:
        trial_id = _trial_id_by_number(session, experiment_id, trial_number)

    now = utc_now()
    proposal = Proposal(
        experiment_id=experiment_id,
        status=ProposalStatus.CONFIRMED,
        trial_number=trial_number,
        target_trial_id=None if created else trial_id,
        confirmed_trial_id=trial_id,
        created_at=now,
        updated_at=now,
        resolved_at=now,
    )
    session.add(proposal)
    session.flush()
    assert proposal.id is not None
    proposal_id = proposal.id

    variables = {
        v.id: v
        for v in session.exec(
            select(Variable)
            .where(Variable.experiment_id == experiment_id)
            .where(col(Variable.id).in_([v.variable_id for v in values]))
        ).all()
    }
    said = {
        t.id: (t.text, t.source, t.created_at)
        for t in session.exec(
            select(Turn)
            .where(Turn.experiment_id == experiment_id)
            .where(Turn.role == Role.USER)
            .where(col(Turn.id).in_([v.turn_id for v in values]))
        ).all()
        if t.source is not None
    }
    rows = [
        ProposalValue(
            proposal_id=proposal_id,
            variable_id=v.variable_id,
            value=v.value,
            unit=variables[v.variable_id].unit,
            original_phrase=said[v.turn_id][0],
            source=said[v.turn_id][1],
            said_at=said[v.turn_id][2],
            turn_id=v.turn_id,
            said_text=v.said_text,
            grounding=v.grounding,
            checked_at=now if v.grounding is None else None,
        )
        for v in values
        if v.variable_id in variables and v.turn_id in said
    ]
    session.add_all(rows)
    session.flush()

    written = _insert_measurements(session, trial_id, proposal_id, rows, saved_by)
    skipped = tuple(r.variable_id for r in rows if r.variable_id not in written)
    if skipped:
        session.exec(
            delete(ProposalValue)
            .where(col(ProposalValue.proposal_id) == proposal_id)
            .where(col(ProposalValue.variable_id).in_(skipped))
        )
    if not written:  # nothing saved: the proposal never happened
        session.exec(delete(Proposal).where(col(Proposal.id) == proposal_id))
    _done(session, commit)
    return SavedNow(
        proposal_id=proposal_id if written else None,
        trial_id=trial_id,
        created_trial=created,
        skipped=skipped,
    )


def unset_values(
    session: Session, proposal_id: int, variable_ids: Iterable[int], *, commit: bool = True
) -> Proposal | PendingError:
    """Take values off the pending card; they moved into a save (spec 0011)."""
    proposal = check_pending(_lock_proposal(session, proposal_id))
    if not isinstance(proposal, Proposal):
        session.rollback()
        return proposal
    session.exec(
        delete(ProposalValue)
        .where(col(ProposalValue.proposal_id) == proposal_id)
        .where(col(ProposalValue.variable_id).in_(list(variable_ids)))
    )
    proposal.updated_at = utc_now()
    session.add(proposal)
    _done(session, commit)
    return proposal


def supersede(
    session: Session, proposal_id: int, *, commit: bool = True
) -> Proposal | PendingError:
    """Retire the pending card: everything it held was saved in this turn (spec 0011)."""
    return _resolve(session, proposal_id, ProposalStatus.SUPERSEDED, commit)


def undo_auto_save(session: Session, proposal_id: int, reopen: bool = True) -> Undone | UndoError:
    """Take back a save LabFlow made with no tap (spec 0011, AC-10): delete the rows it
    wrote, and the trial too when nothing else is left in it (an auto save only inserts, so
    that restores the trial as it was). Only while no user turn came after the save. Then:
    with no card pending, the same proposal comes back pending (spec 0006, AC-29); with a
    card pending for the same trial, its values join that card and it becomes `superseded`;
    with a card for another trial, or `reopen=False` (voice), it becomes `discarded`."""
    proposal = _lock_proposal(session, proposal_id)
    if proposal is None:
        session.rollback()
        return ProposalNotFound()
    trial_id = proposal.confirmed_trial_id
    auto_rows: Sequence[Measurement] = (
        session.exec(
            select(Measurement)
            .where(Measurement.proposal_id == proposal_id)
            .where(col(Measurement.auto_saved))
        ).all()
        if proposal.status == ProposalStatus.CONFIRMED and trial_id is not None
        else []
    )
    if not auto_rows or proposal.resolved_at is None:
        session.rollback()
        return NotAutoSaved()
    later = session.exec(
        select(col(Turn.id))
        .where(Turn.experiment_id == proposal.experiment_id)
        .where(Turn.role == Role.USER)
        .where(col(Turn.created_at) > proposal.resolved_at)
    ).first()
    if later is not None:
        session.rollback()
        return UndoExpired()

    session.exec(delete(Measurement).where(col(Measurement.proposal_id) == proposal_id))
    left = session.exec(select(col(Measurement.id)).where(Measurement.trial_id == trial_id)).first()
    if left is None:
        session.exec(delete(Trial).where(col(Trial.id) == trial_id))  # FKs to it become null
        session.expire_all()
    pending = session.exec(
        select(Proposal)
        .where(Proposal.experiment_id == proposal.experiment_id)
        .where(Proposal.status == ProposalStatus.PENDING)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    proposal = _lock_proposal(session, proposal_id)
    assert proposal is not None and proposal.id is not None

    now = utc_now()
    holder: Proposal = proposal
    if reopen and pending is None:
        outcome = "reopened"
        proposal.status = ProposalStatus.PENDING
        proposal.resolved_at = None
    elif reopen and pending is not None and pending.trial_number == proposal.trial_number:
        outcome, holder = "merged", pending
        _copy_values(session, proposal_id, pending)
        proposal.status = ProposalStatus.SUPERSEDED
        proposal.resolved_at = now
    else:
        outcome = "discarded"
        proposal.status = ProposalStatus.DISCARDED
        proposal.resolved_at = now
    proposal.confirmed_trial_id = None
    proposal.updated_at = now
    session.add(proposal)
    session.commit()
    assert holder.id is not None
    return Undone(
        outcome=outcome,
        proposal_id=holder.id,
        experiment_id=proposal.experiment_id,
        trial_number=proposal.trial_number,
    )


def _copy_values(session: Session, from_id: int, to: Proposal) -> None:
    """The undone save's values join the waiting card, unchecked like any said value; a
    variable the card already holds keeps the card's value."""
    assert to.id is not None
    for v in _values_of(session, from_id):
        session.exec(
            insert(ProposalValue)
            .values(
                proposal_id=to.id,
                variable_id=v.variable_id,
                value=v.value,
                unit=v.unit,
                original_phrase=v.original_phrase,
                source=v.source,
                said_at=v.said_at,
                turn_id=v.turn_id,
                said_text=v.said_text,
                grounding=v.grounding,
                checked_at=v.checked_at,
            )
            .on_conflict_do_nothing(index_elements=["proposal_id", "variable_id"])
        )
    to.updated_at = utc_now()
    session.add(to)


def take_back(session: Session, proposal_id: int) -> Proposal | None:
    """Voice's "deshacer" (spec 0007, AC-7; spec 0011, AC-10): undo the auto save and drop
    its values instead of reopening them, so a card the same turn left waiting stays. None
    when the save cannot be undone."""
    undone = undo_auto_save(session, proposal_id, reopen=False)
    return session.get(Proposal, proposal_id) if isinstance(undone, Undone) else None


def take_back_last(session: Session, experiment_id: int) -> Proposal | None:
    """`take_back` on the notebook's most recent save, never an older one."""
    last = session.exec(
        select(Proposal)
        .where(Proposal.experiment_id == experiment_id)
        .where(Proposal.status == ProposalStatus.CONFIRMED)
        .order_by(col(Proposal.resolved_at).desc(), col(Proposal.id).desc())
        .limit(1)
    ).first()
    if last is None or last.id is None:
        return None
    return take_back(session, last.id)


def discard(session: Session, proposal_id: int, *, commit: bool = True) -> Proposal | PendingError:
    """Drop the card. Nothing is saved (AC-10)."""
    return _resolve(session, proposal_id, ProposalStatus.DISCARDED, commit)


def _resolve(
    session: Session, proposal_id: int, status: ProposalStatus, commit: bool
) -> Proposal | PendingError:
    proposal = check_pending(_lock_proposal(session, proposal_id))
    if not isinstance(proposal, Proposal):
        session.rollback()
        return proposal

    now = utc_now()
    proposal.status = status
    proposal.resolved_at = now
    proposal.updated_at = now
    session.add(proposal)
    _done(session, commit)
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
    session: Session,
    trial_id: int,
    proposal_id: int,
    values: Sequence[ProposalValue],
    saved_by: str | None,
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
                "saved_by": saved_by,
                "auto_saved": False,
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
        "saved_by",
        "auto_saved",
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["trial_id", "variable_id"],
        set_={name: new[name] for name in replaced} | {"edited_at": now},
        where=tuple_(
            col(Measurement.value), col(Measurement.unit), col(Measurement.original_phrase)
        ).is_distinct_from(tuple_(new.value, new.unit, new.original_phrase)),
    )
    session.exec(stmt)


def _insert_measurements(
    session: Session,
    trial_id: int,
    proposal_id: int,
    values: Sequence[ProposalValue],
    saved_by: str,
) -> frozenset[int]:
    """An auto save's rows (spec 0011, AC-12): insert only, `ON CONFLICT DO NOTHING`, so a
    saved value is never replaced without a tap. Returns the variable ids written."""
    if not values:
        return frozenset()
    now = utc_now()
    stmt = (
        insert(Measurement)
        .values(
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
                    "saved_by": saved_by,
                    "auto_saved": True,
                    "confirmed_at": now,
                }
                for v in values
            ]
        )
        .on_conflict_do_nothing(index_elements=["trial_id", "variable_id"])
        .returning(col(Measurement.variable_id))
    )
    return frozenset(session.exec(stmt).scalars().all())
