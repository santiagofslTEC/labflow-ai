"""The conversation history of an experiment (spec 0002, AC-14)."""

from collections.abc import Sequence

from sqlmodel import Session, col, select

from app.models import Experiment, Turn
from app.models.enums import Role, Source
from app.services.results import ExperimentNotFound


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
