"""class folders

Revision ID: 216236577a72
Revises: 0a4272c99a4b
Create Date: 2026-10-30 13:04:50.069242

Class folders on the lab dashboard (2026-10-30): a `folder` table and a nullable
`experiment.folder_id`. Additive only: existing notebooks read as "Sin carpeta". Generated,
then edited by hand to add RLS plus the Data API revoke, like spec 0002's tables.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "216236577a72"
down_revision: str | Sequence[str] | None = "0a4272c99a4b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "folder",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80", name=op.f("ck_folder_name_length")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_folder")),
    )
    op.add_column("experiment", sa.Column("folder_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_experiment_folder_id", "experiment", ["folder_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_experiment_folder_id"),
        "experiment",
        "folder",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute("ALTER TABLE folder ENABLE ROW LEVEL SECURITY")
    op.execute(revoke_data_api("folder"))


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
    op.drop_constraint(op.f("fk_experiment_folder_id"), "experiment", type_="foreignkey")
    op.drop_index("ix_experiment_folder_id", table_name="experiment")
    op.drop_column("experiment", "folder_id")
    op.drop_table("folder")
