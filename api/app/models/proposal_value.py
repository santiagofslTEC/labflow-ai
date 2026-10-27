from datetime import datetime

from sqlalchemy import CheckConstraint, Double, Index
from sqlmodel import Field, SQLModel

from app.models.columns import FINITE, fk_field, id_field, text_field
from app.models.enums import Source, check_in


class ProposalValue(SQLModel, table=True):
    __tablename__ = "proposal_value"  # pyright: ignore[reportAssignmentType]  # SQLModel types it as declared_attr
    __table_args__ = (
        CheckConstraint(f"value {FINITE}", name="value_finite"),
        CheckConstraint(check_in("source", Source), name="source"),
        # Also serves as the proposal_id index, and as the ON CONFLICT target in set_value.
        Index("uq_proposal_value_proposal_variable", "proposal_id", "variable_id", unique=True),
        Index("ix_proposal_value_variable_id", "variable_id"),
        Index("ix_proposal_value_turn_id", "turn_id"),
    )

    id: int | None = id_field()
    proposal_id: int = fk_field("proposal.id", ondelete="CASCADE")
    variable_id: int = fk_field("variable.id", ondelete="CASCADE")
    value: float = Field(sa_type=Double)
    unit: str | None = text_field(nullable=True)  # snapshot of variable.unit
    original_phrase: str = text_field()  # copied from the turn
    source: Source = text_field()  # copied from the turn
    said_at: datetime  # the turn's created_at
    turn_id: int | None = fk_field("turn.id", ondelete="SET NULL", nullable=True)
