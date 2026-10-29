from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, Column, Index
from sqlalchemy import text as sql
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Field, SQLModel

from app.models.columns import fk_field, id_field, now_field, text_field
from app.models.enums import Role, Source, check_in


class Turn(SQLModel, table=True):
    """One line of the conversation. Order by `id`, which grows with each insert."""

    __table_args__ = (
        CheckConstraint(check_in("role", Role), name="role"),
        CheckConstraint(check_in("source", Source), name="source"),
        CheckConstraint("(role = 'user') = (source IS NOT NULL)", name="user_source"),
        # Also serves as the experiment_id index.
        Index("ix_turn_experiment_id_id", "experiment_id", sql("id DESC")),
    )

    id: int | None = id_field()
    experiment_id: int = fk_field("experiment.id", ondelete="CASCADE")
    role: Role = text_field()
    text: str = text_field()
    source: Source | None = text_field(nullable=True)  # set only on user turns
    tool_name: str | None = text_field(nullable=True)  # the tool an assistant turn used
    # The variables an assistant reply named, so "sí" can accept a suggestion (spec 0006).
    variable_ids: list[int] | None = Field(
        default=None, sa_column=Column(ARRAY(BigInteger), nullable=True)
    )
    created_at: datetime = now_field()
