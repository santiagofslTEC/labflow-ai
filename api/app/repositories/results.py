"""A notebook's summary for the results page (spec 0009, AC-7): count, min, max, and mean per
variable, and the trials holding each extreme, as SQL aggregates over saved measurements
(spec 0001). Read only; the browser and the model never compute these."""

from collections.abc import Sequence

from sqlalchemy import func, tuple_
from sqlmodel import Session, col, select

from app.models import Experiment, Measurement, Trial, Variable
from app.services.results import ExperimentNotFound, ResultsView, VariableSummary


def summarize(session: Session, experiment_id: int) -> ResultsView | ExperimentNotFound:
    if session.get(Experiment, experiment_id) is None:
        return ExperimentNotFound()
    variable_ids = session.exec(
        select(col(Variable.id))
        .where(Variable.experiment_id == experiment_id)
        .order_by(col(Variable.position), col(Variable.id))
    ).all()

    value = col(Measurement.value)
    in_notebook = col(Trial.experiment_id) == experiment_id
    joined = col(Trial.id) == col(Measurement.trial_id)
    stats = {
        variable_id: (count, low, high)
        for variable_id, count, low, high in session.exec(
            select(col(Measurement.variable_id), func.count(), func.min(value), func.max(value))
            .join(Trial, joined)
            .where(in_notebook)
            .group_by(col(Measurement.variable_id))
        ).all()
    }
    # The mean is SQL's sum over SQL's count (`func.avg` is untyped in SQLAlchemy's stubs).
    sums: dict[int, float] = dict(
        session.exec(
            select(col(Measurement.variable_id), func.sum(value))
            .join(Trial, joined)
            .where(in_notebook)
            .group_by(col(Measurement.variable_id))
        ).all()
    )
    # Every trial whose value equals a variable's min or max, in trial order.
    targets = [(v, bound) for v, (_, low, high) in stats.items() for bound in (low, high)]
    at_extremes: Sequence[tuple[int, int, float]] = (
        session.exec(
            select(col(Measurement.variable_id), col(Trial.number), value)
            .join(Trial, joined)
            .where(in_notebook)
            .where(tuple_(col(Measurement.variable_id), value).in_(targets))
            .order_by(col(Trial.number))
        ).all()
        if targets
        else []
    )

    def summary(variable_id: int) -> VariableSummary:
        if variable_id not in stats:
            return VariableSummary(
                variable_id=variable_id,
                count=0,
                min=None,
                max=None,
                mean=None,
                min_trials=(),
                max_trials=(),
            )
        count, low, high = stats[variable_id]
        own = [(number, v) for vid, number, v in at_extremes if vid == variable_id]
        return VariableSummary(
            variable_id=variable_id,
            count=count,
            min=low,
            max=high,
            mean=sums[variable_id] / count,
            min_trials=tuple(number for number, v in own if v == low),
            max_trials=tuple(number for number, v in own if v == high),
        )

    return ResultsView(variables=tuple(summary(v) for v in variable_ids if v is not None))
