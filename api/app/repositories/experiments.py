"""Notebooks: list, create, and open (spec 0005, AC-14 to AC-16)."""

from datetime import UTC, datetime

from psycopg.errors import UniqueViolation
from sqlalchemy import DateTime, Integer, func, type_coerce
from sqlalchemy import select as select_row
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Trial, Turn, Variable
from app.services.experiment_rules import NewExperiment
from app.services.results import (
    DuplicateVariableName,
    ExperimentDetail,
    ExperimentNotFound,
    ExperimentSummary,
    VariableDetail,
)

LIST_LIMIT = 200
_UNIQUE_NAME_INDEX = "uq_variable_experiment_name"


def list_summaries(session: Session, limit: int = LIST_LIMIT) -> list[ExperimentSummary]:
    """Newest activity first, ties by higher id. Each stat comes from its own grouped
    subquery joined on `experiment_id`, so no join multiplies the counts."""
    trials = (
        select(col(Trial.experiment_id), func.count().label("trial_count"))
        .group_by(col(Trial.experiment_id))
        .subquery()
    )
    turns = (
        select(col(Turn.experiment_id), func.max(Turn.created_at).label("last_turn_at"))
        .group_by(col(Turn.experiment_id))
        .subquery()
    )
    measurements = (
        select(
            col(Trial.experiment_id),
            func.max(Measurement.confirmed_at).label("last_confirmed_at"),
            func.max(Measurement.edited_at).label("last_edited_at"),
        )
        .join(Trial, col(Measurement.trial_id) == col(Trial.id))
        .group_by(col(Trial.experiment_id))
        .subquery()
    )
    # GREATEST skips nulls, and created_at is never null, so a quiet notebook falls back to it.
    last_activity_at = type_coerce(
        func.greatest(
            col(Experiment.created_at),
            turns.c.last_turn_at,
            measurements.c.last_confirmed_at,
            measurements.c.last_edited_at,
        ),
        DateTime(timezone=True),
    ).label("last_activity_at")
    # SQLAlchemy's select: SQLModel's is only typed up to four columns.
    stmt = (
        select_row(
            col(Experiment.id),
            col(Experiment.title),
            col(Experiment.status),
            func.coalesce(type_coerce(trials.c.trial_count, Integer), 0).label("trial_count"),
            last_activity_at,
        )
        .outerjoin(trials, trials.c.experiment_id == col(Experiment.id))
        .outerjoin(turns, turns.c.experiment_id == col(Experiment.id))
        .outerjoin(measurements, measurements.c.experiment_id == col(Experiment.id))
        .order_by(last_activity_at.desc(), col(Experiment.id).desc())
        .limit(limit)
    )
    # Run on the session's connection (same transaction): Session.execute is deprecated in SQLModel.
    rows = session.connection().execute(stmt).all()
    return [
        ExperimentSummary(
            id=experiment_id,
            title=title,
            status=status,
            trial_count=trial_count,
            last_activity_at=_utc(last_at),
        )
        for experiment_id, title, status, trial_count, last_at in rows
        if experiment_id is not None  # an identity column is never null
    ]


def create_experiment(
    session: Session, holder: str, body: NewExperiment
) -> ExperimentDetail | DuplicateVariableName:
    """The notebook and its variables in one transaction, `position` in request order.
    The unique index on `lower(name)` is the backstop for any case fold the pure check missed."""
    experiment = Experiment(title=body.title, goal=body.goal, created_by=holder)
    session.add(experiment)
    session.flush()
    assert experiment.id is not None  # set by the flush
    session.add_all(
        Variable(
            experiment_id=experiment.id,
            name=variable.name,
            unit=variable.unit,
            min_value=variable.min_value,
            max_value=variable.max_value,
            required=variable.required,
            position=position,
        )
        for position, variable in enumerate(body.variables)
    )
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        if _is_unique_name_violation(error):
            return DuplicateVariableName(name=None)
        raise
    session.commit()
    created = get_experiment(session, experiment.id)
    assert isinstance(created, ExperimentDetail)  # just committed
    return created


def get_experiment(session: Session, experiment_id: int) -> ExperimentDetail | ExperimentNotFound:
    experiment = session.get(Experiment, experiment_id)
    if experiment is None or experiment.id is None:
        return ExperimentNotFound()
    variables = session.exec(
        select(Variable)
        .where(Variable.experiment_id == experiment_id)
        .order_by(col(Variable.position))
    ).all()
    return ExperimentDetail(
        id=experiment.id,
        title=experiment.title,
        goal=experiment.goal,
        status=experiment.status,
        created_by=experiment.created_by,
        created_at=_utc(experiment.created_at),
        variables=tuple(_variable_detail(v) for v in variables),
    )


def _utc(moment: datetime) -> datetime:
    return moment.astimezone(UTC)


def _variable_detail(variable: Variable) -> VariableDetail:
    assert variable.id is not None  # read back from the DB
    return VariableDetail(
        id=variable.id,
        name=variable.name,
        unit=variable.unit,
        min_value=variable.min_value,
        max_value=variable.max_value,
        required=variable.required,
        position=variable.position,
    )


def _is_unique_name_violation(error: IntegrityError) -> bool:
    cause = error.orig
    return isinstance(cause, UniqueViolation) and cause.diag.constraint_name == _UNIQUE_NAME_INDEX
