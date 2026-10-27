from datetime import datetime

from sqlalchemy import CheckConstraint
from sqlmodel import SQLModel

from app.models.columns import enum_field, id_field, now_field, text_field
from app.models.enums import ExperimentStatus, check_in


class Experiment(SQLModel, table=True):
    __table_args__ = (
        CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title_length"),
        CheckConstraint(check_in("status", ExperimentStatus), name="status"),
    )

    id: int | None = id_field()
    title: str = text_field()
    goal: str | None = text_field(nullable=True)
    status: ExperimentStatus = enum_field(ExperimentStatus.OPEN)
    created_by: str = text_field()  # the access code holder name
    created_at: datetime = now_field()
