"""Notebooks: list, create, and open (spec 0005, AC-14 to AC-16, AC-29, AC-31)."""

from datetime import UTC, datetime
from uuid import UUID

from psycopg.errors import UniqueViolation
from sqlalchemy import DateTime, Integer, func, type_coerce
from sqlalchemy import select as select_row
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.models import (
    Experiment,
    Measurement,
    Protocol,
    ProtocolPage,
    Trial,
    Turn,
    Variable,
)
from app.repositories.space import folder_visible, in_space
from app.services.experiment_rules import NewExperiment
from app.services.instructions import NewProtocol
from app.services.results import (
    DuplicateVariableName,
    ExperimentDetail,
    ExperimentNotFound,
    ExperimentSummary,
    FolderNotFound,
    ProtocolSummary,
    VariableDetail,
)

LIST_LIMIT = 200
_UNIQUE_NAME_INDEX = "uq_variable_experiment_name"


def list_summaries(
    session: Session, owner: UUID | None = None, limit: int = LIST_LIMIT
) -> list[ExperimentSummary]:
    """Newest activity first, ties by higher id. Each stat comes from its own grouped
    subquery joined on `experiment_id`, so no join multiplies the counts."""
    # A trial counts once it holds a saved value (spec 0011, AC-11).
    trials = (
        select(
            col(Trial.experiment_id), func.count(func.distinct(col(Trial.id))).label("trial_count")
        )
        .join(Measurement, col(Measurement.trial_id) == col(Trial.id))
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
            col(Experiment.folder_id),
        )
        .outerjoin(trials, trials.c.experiment_id == col(Experiment.id))
        .outerjoin(turns, turns.c.experiment_id == col(Experiment.id))
        .outerjoin(measurements, measurements.c.experiment_id == col(Experiment.id))
        .where(in_space(owner))  # the caller's space only (spec 0014, AC-6)
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
            folder_id=folder_id,
        )
        for experiment_id, title, status, trial_count, last_at, folder_id in rows
        if experiment_id is not None  # an identity column is never null
    ]


def create_experiment(
    session: Session,
    holder: str,
    body: NewExperiment,
    protocol: NewProtocol | None = None,
    owner: UUID | None = None,
) -> ExperimentDetail | DuplicateVariableName | FolderNotFound:
    """The notebook, its variables, and its instructions (when sent) in one transaction,
    `position` in request order. The unique index on `lower(name)` is the backstop for any
    case fold the pure check missed."""
    if body.folder_id is not None and not folder_visible(session, body.folder_id, owner):
        return FolderNotFound()
    experiment = Experiment(
        title=body.title,
        goal=body.goal,
        context=body.context,
        created_by=holder,
        owner_id=owner,
        folder_id=body.folder_id,
    )
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
        if protocol is not None:
            _add_protocol(session, experiment.id, protocol)
            session.flush()
    except IntegrityError as error:
        session.rollback()
        if is_unique_name_violation(error):
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
        context=experiment.context,
        status=experiment.status,
        created_by=experiment.created_by,
        created_at=_utc(experiment.created_at),
        folder_id=experiment.folder_id,
        variables=tuple(variable_detail(v) for v in variables),
        protocol=_protocol_summary(session, experiment_id),
    )


def _add_protocol(session: Session, experiment_id: int, protocol: NewProtocol) -> None:
    row = Protocol(
        experiment_id=experiment_id,
        source=protocol.source,
        filename=protocol.filename,
        file_bytes=protocol.file_bytes,
        byte_size=None if protocol.file_bytes is None else len(protocol.file_bytes),
        page_count=len(protocol.pages),
        read_from_page=protocol.read_from_page,
        read_to_page=protocol.read_to_page,
    )
    session.add(row)
    session.flush()
    assert row.id is not None  # set by the flush
    session.add_all(
        ProtocolPage(protocol_id=row.id, page_number=number, text=text)
        for number, text in enumerate(protocol.pages, start=1)
    )


def _protocol_summary(session: Session, experiment_id: int) -> ProtocolSummary | None:
    """Explicit columns, so `file_bytes` is never loaded here."""
    stmt = select_row(
        col(Protocol.source),
        col(Protocol.filename),
        col(Protocol.page_count),
        col(Protocol.read_from_page),
        col(Protocol.read_to_page),
    ).where(col(Protocol.experiment_id) == experiment_id)
    row = session.connection().execute(stmt).first()
    if row is None:
        return None
    source, filename, page_count, read_from_page, read_to_page = row
    return ProtocolSummary(
        source="pdf" if source == "pdf" else "text",
        filename=filename,
        page_count=page_count,
        read_from_page=read_from_page,
        read_to_page=read_to_page,
    )


def _utc(moment: datetime) -> datetime:
    return moment.astimezone(UTC)


def variable_detail(variable: Variable) -> VariableDetail:
    assert variable.id is not None  # read back from the DB
    return VariableDetail(
        id=variable.id,
        name=variable.name,
        unit=variable.unit,
        min_value=variable.min_value,
        max_value=variable.max_value,
        required=variable.required,
        position=variable.position,
        aliases=tuple(variable.aliases),
    )


def is_unique_name_violation(error: IntegrityError) -> bool:
    cause = error.orig
    return isinstance(cause, UniqueViolation) and cause.diag.constraint_name == _UNIQUE_NAME_INDEX
