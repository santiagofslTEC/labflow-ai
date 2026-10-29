from sqlalchemy import CheckConstraint, Integer, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.columns import fk_field, id_field, text_field


class ProtocolPage(SQLModel, table=True):
    """One page of extracted text (pasted text is page 1), kept for feature 17."""

    __tablename__ = "protocol_page"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        CheckConstraint("page_number >= 1", name="page_number"),
        # Also serves lookups by protocol.
        UniqueConstraint("protocol_id", "page_number", name="uq_protocol_page_protocol_id"),
    )

    id: int | None = id_field()
    protocol_id: int = fk_field("protocol.id", ondelete="CASCADE")
    page_number: int = Field(sa_type=Integer)
    text: str = text_field()
