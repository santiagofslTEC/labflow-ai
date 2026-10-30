"""The conversation history of an experiment (spec 0002, AC-14)."""

from collections.abc import Sequence

from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Trial, Turn, Variable
from app.models.enums import Role, Source
from app.services.results import ExperimentNotFound, TurnLine, TurnReading


def add_turn(
    session: Session,
    experiment_id: int,
    role: Role,
    text: str,
    source: Source | None,
    tool_name: str | None = None,
    variable_ids: Sequence[int] = (),
) -> Turn | ExperimentNotFound:
    """Store one turn. A user turn needs a source and an assistant turn has none; a wrong
    pairing is a bug, and the CHECK raises it. `variable_ids` are the variables an assistant
    reply named."""
    if session.get(Experiment, experiment_id) is None:
        session.rollback()
        return ExperimentNotFound()
    turn = Turn(
        experiment_id=experiment_id,
        role=role,
        text=text,
        source=source,
        tool_name=tool_name,
        variable_ids=list(variable_ids) or None,
    )
    session.add(turn)
    session.commit()
    session.refresh(turn)
    return turn


def last_turns(session: Session, experiment_id: int, limit: int = 10) -> list[Turn]:
    """The latest `limit` turns, oldest first. Ordered by `id`, not `created_at`."""
    latest = session.exec(
        select(Turn)
        .where(Turn.experiment_id == experiment_id)
        .order_by(col(Turn.id).desc())
        .limit(limit)
    ).all()
    return list(reversed(latest))


def conversation(
    session: Session, experiment_id: int, limit: int = 200
) -> list[TurnLine] | ExperimentNotFound:
    """The latest `limit` turns for the notebook's thread, oldest first, each user line with
    the values it saved that are still in the table (a later correction moves a value to the
    line that corrected it)."""
    if session.get(Experiment, experiment_id) is None:
        return ExperimentNotFound()
    lines = [t for t in last_turns(session, experiment_id, limit) if t.id is not None]
    readings = _readings(session, [t.id for t in lines if t.id is not None])
    return [
        TurnLine(
            id=t.id,
            role=t.role,
            text=t.text,
            source=t.source,
            created_at=t.created_at,
            readings=readings.get(t.id, ()),
        )
        for t in lines
        if t.id is not None
    ]


def _readings(session: Session, turn_ids: list[int]) -> dict[int, tuple[TurnReading, ...]]:
    """The saved values of these turns, in column order."""
    if not turn_ids:
        return {}
    rows = session.exec(
        select(Measurement, Variable, Trial)
        .join(Variable, col(Variable.id) == col(Measurement.variable_id))
        .join(Trial, col(Trial.id) == col(Measurement.trial_id))
        .where(col(Measurement.turn_id).in_(turn_ids))
        .order_by(col(Trial.number), col(Variable.position))
    ).all()
    grouped: dict[int, list[TurnReading]] = {}
    for measurement, variable, trial in rows:
        if measurement.turn_id is None:
            continue
        grouped.setdefault(measurement.turn_id, []).append(
            TurnReading(
                variable=variable.name,
                said_text=measurement.said_text,
                value=measurement.value,
                unit=measurement.unit,
                trial_number=trial.number,
            )
        )
    return {turn_id: tuple(values) for turn_id, values in grouped.items()}
