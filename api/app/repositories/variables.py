"""Add, edit, and delete a notebook's variables after it exists (spec 0008). Each write locks
the row it checks against, so a save or another edit cannot slip in between the check and
the write."""

from collections.abc import Sequence

from sqlalchemy import delete
from sqlalchemy import select as select_row
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Trial, Variable
from app.models.enums import ExperimentStatus
from app.repositories.experiments import is_unique_name_violation, variable_detail
from app.services.experiment_rules import VARIABLES_MAX, VariableIn, check_variable
from app.services.results import (
    DuplicateVariableName,
    ExperimentClosed,
    ExperimentNotFound,
    InvalidRange,
    LastVariable,
    NameInUse,
    UnitLocked,
    VariableDetail,
    VariableNotFound,
    VariablesDeleted,
    VariablesFull,
)

type AddError = (
    ExperimentNotFound
    | ExperimentClosed
    | VariablesFull
    | DuplicateVariableName
    | NameInUse
    | InvalidRange
)
type UpdateError = (
    VariableNotFound
    | ExperimentClosed
    | UnitLocked
    | DuplicateVariableName
    | NameInUse
    | InvalidRange
)
type DeleteError = ExperimentNotFound | ExperimentClosed | VariableNotFound | LastVariable


def _lock_experiment(session: Session, experiment_id: int) -> Experiment | None:
    """`FOR NO KEY UPDATE`, like `start_proposal`: it serializes the variable writes without
    blocking a concurrent confirm's trial insert (an FK key share on the experiment)."""
    return session.exec(
        select(Experiment)
        .where(Experiment.id == experiment_id)
        .with_for_update(key_share=True)
        .execution_options(populate_existing=True)
    ).first()


def _variables_of(session: Session, experiment_id: int) -> Sequence[Variable]:
    return session.exec(
        select(Variable)
        .where(Variable.experiment_id == experiment_id)
        .order_by(col(Variable.position), col(Variable.id))
    ).all()


def _has_values(session: Session, variable_id: int) -> bool:
    return (
        session.exec(
            select(col(Measurement.id)).where(Measurement.variable_id == variable_id).limit(1)
        ).first()
        is not None
    )


def _write(session: Session, variable: Variable, body: VariableIn) -> None:
    variable.name = body.name
    variable.unit = body.unit
    variable.min_value = body.min_value
    variable.max_value = body.max_value
    variable.required = body.required
    variable.aliases = list(body.aliases)
    session.add(variable)


def _commit_variable(
    session: Session, variable: Variable
) -> VariableDetail | DuplicateVariableName:
    """Commit, turning the `lower(name)` index into a typed result (the pure check's backstop)."""
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        if is_unique_name_violation(error):
            return DuplicateVariableName(name=None)
        raise
    session.commit()
    session.refresh(variable)
    return variable_detail(variable)


def add_variable(
    session: Session, experiment_id: int, body: VariableIn
) -> VariableDetail | AddError:
    """The new variable goes last (AC-2). The notebook row is locked, so two adds cannot both
    pass the limit of 12."""
    experiment = _lock_experiment(session, experiment_id)
    if experiment is None:
        session.rollback()
        return ExperimentNotFound()
    if experiment.status == ExperimentStatus.CLOSED:
        session.rollback()
        return ExperimentClosed()
    existing = _variables_of(session, experiment_id)
    if len(existing) >= VARIABLES_MAX:
        session.rollback()
        return VariablesFull()
    if (problem := check_variable(body, ((v.name, v.aliases) for v in existing))) is not None:
        session.rollback()
        return problem
    variable = Variable(
        experiment_id=experiment_id,
        name=body.name,
        position=max((v.position for v in existing), default=-1) + 1,
    )
    _write(session, variable, body)
    return _commit_variable(session, variable)


def update_variable(
    session: Session, variable_id: int, body: VariableIn
) -> VariableDetail | UpdateError:
    """A full replacement (AC-3). The unit cannot change once a value is saved, because saved
    values are stored in it. The notebook row is locked like an add, so two edits cannot both
    pass the name check (AC-10)."""
    found = session.get(Variable, variable_id)
    if found is None or _lock_experiment(session, found.experiment_id) is None:
        session.rollback()
        return VariableNotFound()
    variable = session.exec(
        select(Variable)
        .where(Variable.id == variable_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    if variable is None:
        session.rollback()
        return VariableNotFound()
    experiment = session.get(Experiment, variable.experiment_id)
    if experiment is None or experiment.status == ExperimentStatus.CLOSED:
        session.rollback()
        return ExperimentClosed()
    others = (
        (v.name, v.aliases)
        for v in _variables_of(session, variable.experiment_id)
        if v.id != variable_id
    )
    if (problem := check_variable(body, others)) is not None:
        session.rollback()
        return problem
    if body.unit != variable.unit and _has_values(session, variable_id):
        session.rollback()
        return UnitLocked()
    _write(session, variable, body)
    return _commit_variable(session, variable)


def delete_variables(
    session: Session, experiment_id: int, variable_ids: Sequence[int]
) -> VariablesDeleted | DeleteError:
    """Their saved values, the trials left empty, then the variables, in one transaction
    (AC-6). `measurement.variable_id` is NO ACTION, so the values must go first; a pending
    card's values cascade with the variable."""
    experiment = _lock_experiment(session, experiment_id)
    if experiment is None:
        session.rollback()
        return ExperimentNotFound()
    if experiment.status == ExperimentStatus.CLOSED:
        session.rollback()
        return ExperimentClosed()
    existing = {v.id for v in _variables_of(session, experiment_id)}
    wanted = set(variable_ids)
    if not wanted <= existing:
        session.rollback()
        return VariableNotFound()
    if wanted == existing:
        session.rollback()
        return LastVariable()

    touched = set(
        session.exec(
            select(col(Measurement.trial_id))
            .where(col(Measurement.variable_id).in_(wanted))
            .distinct()
        ).all()
    )
    measurements = session.exec(
        delete(Measurement).where(col(Measurement.variable_id).in_(wanted))
    ).rowcount
    still_used = select_row(col(Measurement.trial_id)).where(
        col(Measurement.trial_id) == col(Trial.id)
    )
    trials = (
        session.exec(
            delete(Trial).where(col(Trial.id).in_(touched)).where(~still_used.exists())
        ).rowcount
        if touched
        else 0
    )
    variables = session.exec(delete(Variable).where(col(Variable.id).in_(wanted))).rowcount
    session.commit()
    return VariablesDeleted(variables=variables, measurements=measurements, trials=trials)
