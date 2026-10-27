from datetime import datetime

from sqlalchemy import CheckConstraint, Column, Double, Index, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Field, SQLModel

from app.models.columns import fk_field, id_field, now_field, text_field


class Variable(SQLModel, table=True):
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 80", name="name_length"),
        CheckConstraint(
            "min_value IS NULL OR max_value IS NULL OR min_value <= max_value", name="range"
        ),
        CheckConstraint("position >= 0", name="position"),
        # Also serves as the experiment_id index.
        Index("uq_variable_experiment_name", "experiment_id", text("lower(name)"), unique=True),
    )

    id: int | None = id_field()
    experiment_id: int = fk_field("experiment.id", ondelete="CASCADE")
    name: str = text_field()
    unit: str | None = text_field(nullable=True)  # canonical (°C, min, %); null when unitless
    min_value: float | None = Field(default=None, sa_type=Double)
    max_value: float | None = Field(default=None, sa_type=Double)
    required: bool = Field(default=True, sa_column_kwargs={"server_default": "true"})
    position: int = Field(sa_type=SmallInteger)  # column order
    aliases: list[str] = Field(  # other names fed to the LLM
        default_factory=list,
        sa_column=Column(ARRAY(Text), nullable=False, server_default="{}"),
    )
    created_at: datetime = now_field()
