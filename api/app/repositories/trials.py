"""A notebook's saved trials for the side panel (spec 0007, AC-1). Read only: only
`proposals.confirm` writes `trial` and `measurement`, so no status filter is needed."""

from datetime import UTC, datetime
from itertools import groupby

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Trial
from app.services.results import (
    ExperimentNotFound,
    RecentMeasurement,
    TrialCell,
    TrialRow,
    TrialsView,
)

RECENT_LIMIT = 5


def _saved_at(measurement: Measurement) -> datetime:
    return (measurement.edited_at or measurement.confirmed_at).astimezone(UTC)


def list_trials(session: Session, experiment_id: int) -> TrialsView | ExperimentNotFound:
    """Trials by number with their cells, plus the newest measurements across them."""
    if session.get(Experiment, experiment_id) is None:
        return ExperimentNotFound()
    rows = session.exec(
        select(Trial, Measurement)
        .join(Measurement, col(Measurement.trial_id) == col(Trial.id))
        .where(Trial.experiment_id == experiment_id)
        .order_by(col(Trial.number), col(Measurement.variable_id))
    ).all()
    trials = tuple(
        TrialRow(
            id=trial_id,
            number=number,
            cells=tuple(
                TrialCell(
                    variable_id=m.variable_id,
                    value=m.value,
                    said_text=m.said_text,
                    saved_at=_saved_at(m),
                )
                for _, m in group
            ),
        )
        for (trial_id, number), group in groupby(
            ((t, m) for t, m in rows if t.id is not None),
            key=lambda pair: (pair[0].id or 0, pair[0].number),
        )
    )
    saved_at = func.coalesce(col(Measurement.edited_at), col(Measurement.confirmed_at))
    newest = session.exec(
        select(Trial.number, Measurement)
        .join(Measurement, col(Measurement.trial_id) == col(Trial.id))
        .where(Trial.experiment_id == experiment_id)
        .order_by(saved_at.desc(), col(Measurement.id).desc())
        .limit(RECENT_LIMIT)
    ).all()
    recent = tuple(
        RecentMeasurement(
            trial_number=number, variable_id=m.variable_id, value=m.value, saved_at=_saved_at(m)
        )
        for number, m in newest
    )
    return TrialsView(trials=trials, recent=recent)
