from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import CheckConstraint, Index
from sqlmodel import Field, SQLModel

from app.models.columns import enum_field, fk_field, id_field, now_field, text_field
from app.models.enums import ExperimentStatus, check_in


class Experiment(SQLModel, table=True):
    __table_args__ = (
        CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title_length"),
        CheckConstraint(check_in("status", ExperimentStatus), name="status"),
        CheckConstraint("char_length(context) <= 600", name="context_length"),
        Index("ix_experiment_owner_id_id", "owner_id", "id"),
        Index("ix_experiment_folder_id", "folder_id"),
    )

    id: int | None = id_field()
    title: str = text_field()
    goal: str | None = text_field(nullable=True)
    context: str | None = text_field(nullable=True)  # read into every capture prompt (spec 0005)
    status: ExperimentStatus = enum_field(ExperimentStatus.OPEN)
    # Deleting a folder leaves its notebooks without one.
    folder_id: int | None = fk_field("folder.id", ondelete="SET NULL", nullable=True)
    created_by: str = text_field()  # an account's email or an access code's name
    # The Supabase account that owns it; null is the access codes' shared space (spec 0014).
    owner_id: UUID | None = Field(default=None, sa_type=sa.Uuid, nullable=True)
    created_at: datetime = now_field()
