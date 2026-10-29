"""notebook instructions

Revision ID: e68b3b64c4ba
Revises: bd57169691b8
Create Date: 2026-10-29 09:34:31.493086

Spec 0005, instructions path: `experiment.context` and the `protocol` and `protocol_page`
tables (spec 0002 AC-15 planned the protocol table). Additive only. Drafted by autogenerate,
then edited by hand: the `context` CHECK, `SET STORAGE EXTERNAL` on the PDF bytes, and RLS
plus the Data API revokes, like spec 0002's tables.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e68b3b64c4ba"
down_revision: str | Sequence[str] | None = "bd57169691b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_TABLES = ("protocol", "protocol_page")


def upgrade() -> None:
    op.create_table(
        "protocol",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("experiment_id", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=True),
        sa.Column("file_bytes", sa.LargeBinary(), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("read_from_page", sa.Integer(), nullable=True),
        sa.Column("read_to_page", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(source = 'pdf') = "
            "(file_bytes IS NOT NULL AND filename IS NOT NULL AND byte_size IS NOT NULL)",
            name=op.f("ck_protocol_pdf_file"),
        ),
        sa.CheckConstraint(
            "source <> 'text' OR (read_from_page IS NULL AND read_to_page IS NULL)",
            name=op.f("ck_protocol_text_range"),
        ),
        sa.CheckConstraint("source IN ('pdf', 'text')", name=op.f("ck_protocol_source")),
        sa.CheckConstraint(
            "(read_from_page IS NULL AND read_to_page IS NULL) OR "
            "(1 <= read_from_page AND read_from_page <= read_to_page "
            "AND read_to_page <= page_count)",
            name=op.f("ck_protocol_read_range"),
        ),
        sa.CheckConstraint("byte_size BETWEEN 1 AND 10485760", name=op.f("ck_protocol_byte_size")),
        sa.CheckConstraint(
            "char_length(filename) <= 255", name=op.f("ck_protocol_filename_length")
        ),
        sa.CheckConstraint("page_count BETWEEN 1 AND 80", name=op.f("ck_protocol_page_count")),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiment.id"],
            name=op.f("fk_protocol_experiment_id"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_protocol")),
        sa.UniqueConstraint("experiment_id", name="uq_protocol_experiment_id"),
    )
    op.create_table(
        "protocol_page",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("protocol_id", sa.BigInteger(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.CheckConstraint("page_number >= 1", name=op.f("ck_protocol_page_page_number")),
        sa.ForeignKeyConstraint(
            ["protocol_id"],
            ["protocol.id"],
            name=op.f("fk_protocol_page_protocol_id"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_protocol_page")),
        sa.UniqueConstraint("protocol_id", "page_number", name="uq_protocol_page_protocol_id"),
    )
    op.add_column("experiment", sa.Column("context", sa.Text(), nullable=True))
    op.create_check_constraint(
        op.f("ck_experiment_context_length"), "experiment", "char_length(context) <= 600"
    )
    # A PDF is already compressed, so Postgres skips trying again.
    op.execute("ALTER TABLE protocol ALTER COLUMN file_bytes SET STORAGE EXTERNAL")
    for table in NEW_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(revoke_data_api(table))


def revoke_data_api(table: str) -> str:
    """The revoke, skipped where the Supabase roles do not exist (copied from the data model
    migration: a migration never imports another)."""
    return f"""
        DO $$ BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')
               AND EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON {table} FROM anon, authenticated;
            END IF;
        END $$
    """


def downgrade() -> None:
    op.drop_constraint(op.f("ck_experiment_context_length"), "experiment", type_="check")
    op.drop_column("experiment", "context")
    op.drop_table("protocol_page")
    op.drop_table("protocol")
