from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import CheckConstraint, Index
from sqlmodel import Field, SQLModel

from app.models.columns import id_field, now_field, text_field


class Folder(SQLModel, table=True):
    """A class folder on the lab dashboard (2026-10-30). A notebook sits in at most one."""

    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 80", name="name_length"),
        Index("ix_folder_owner_id", "owner_id"),
    )

    id: int | None = id_field()
    name: str = text_field()
    created_by: str = text_field()  # an account's email or an access code's name
    # The Supabase account that owns it; null is the access codes' shared space (spec 0014).
    owner_id: UUID | None = Field(default=None, sa_type=sa.Uuid, nullable=True)
    created_at: datetime = now_field()
