from datetime import datetime

from sqlalchemy import CheckConstraint, Index
from sqlmodel import SQLModel

from app.models.columns import fk_field, id_field, now_field


class Trial(SQLModel, table=True):
    """A saved trial. Only `proposals.confirm` inserts here (spec 0002)."""

    __table_args__ = (
        CheckConstraint("number > 0", name="number"),
        # Also serves as the experiment_id index, and as the ON CONFLICT target in confirm.
        Index("uq_trial_experiment_number", "experiment_id", "number", unique=True),
    )

    id: int | None = id_field()
    experiment_id: int = fk_field("experiment.id", ondelete="CASCADE")
    number: int
    created_at: datetime = now_field()
