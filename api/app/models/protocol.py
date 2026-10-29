from datetime import datetime

from sqlalchemy import CheckConstraint, Column, Integer, LargeBinary, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.columns import fk_field, id_field, now_field, text_field


class Protocol(SQLModel, table=True):
    """A notebook's instructions (spec 0005, instructions path): the PDF, or pasted text.

    `file_bytes` is large; every read that does not need it selects explicit columns.
    """

    __table_args__ = (
        CheckConstraint("source IN ('pdf', 'text')", name="source"),
        CheckConstraint("char_length(filename) <= 255", name="filename_length"),
        CheckConstraint("byte_size BETWEEN 1 AND 10485760", name="byte_size"),
        CheckConstraint("page_count BETWEEN 1 AND 80", name="page_count"),
        CheckConstraint(
            "(read_from_page IS NULL AND read_to_page IS NULL) OR "
            "(1 <= read_from_page AND read_from_page <= read_to_page "
            "AND read_to_page <= page_count)",
            name="read_range",
        ),
        CheckConstraint(
            "(source = 'pdf') = "
            "(file_bytes IS NOT NULL AND filename IS NOT NULL AND byte_size IS NOT NULL)",
            name="pdf_file",
        ),
        CheckConstraint(
            "source <> 'text' OR (read_from_page IS NULL AND read_to_page IS NULL)",
            name="text_range",
        ),
        # One protocol per notebook; also serves as the experiment_id index.
        UniqueConstraint("experiment_id", name="uq_protocol_experiment_id"),
    )

    id: int | None = id_field()
    experiment_id: int = fk_field("experiment.id", ondelete="CASCADE")
    source: str = text_field()  # pdf | text
    filename: str | None = text_field(nullable=True)
    file_bytes: bytes | None = Field(default=None, sa_column=Column(LargeBinary, nullable=True))
    byte_size: int | None = Field(default=None, sa_type=Integer)
    page_count: int = Field(sa_type=Integer)
    read_from_page: int | None = Field(default=None, sa_type=Integer)
    read_to_page: int | None = Field(default=None, sa_type=Integer)
    created_at: datetime = now_field()
