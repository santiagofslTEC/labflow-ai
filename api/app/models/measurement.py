from datetime import datetime

from sqlalchemy import CheckConstraint, Double, Index
from sqlmodel import Field, SQLModel

from app.models.columns import FINITE, fk_field, id_field, now_field, text_field
from app.models.enums import Source, check_in


class Measurement(SQLModel, table=True):
    """A confirmed value. Only `proposals.confirm` writes here, so reads need no state filter."""

    __table_args__ = (
        CheckConstraint(f"value {FINITE}", name="value_finite"),
        CheckConstraint(check_in("source", Source), name="source"),
        # Also serves as the trial_id index, and as the ON CONFLICT target in confirm.
        Index("uq_measurement_trial_variable", "trial_id", "variable_id", unique=True),
        Index("ix_measurement_variable_id", "variable_id"),
        Index("ix_measurement_turn_id", "turn_id"),
        Index("ix_measurement_proposal_id", "proposal_id"),
    )

    id: int | None = id_field()
    trial_id: int = fk_field("trial.id", ondelete="CASCADE")
    # NO ACTION, not RESTRICT: checked at statement end, so an experiment delete can
    # cascade through trial first, while a direct variable delete still fails.
    variable_id: int = fk_field("variable.id")
    value: float = Field(sa_type=Double)  # in the variable's unit
    unit: str | None = text_field(nullable=True)
    original_phrase: str = text_field()
    source: Source = text_field()
    said_at: datetime
    turn_id: int | None = fk_field("turn.id", ondelete="SET NULL", nullable=True)
    # The proposal that last wrote this row.
    proposal_id: int | None = fk_field("proposal.id", ondelete="SET NULL", nullable=True)
    confirmed_at: datetime = now_field()  # first confirm
    edited_at: datetime | None = None  # every later update
