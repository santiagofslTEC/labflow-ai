"""folder owner

Revision ID: 7b3e9c51d2a4
Revises: 4f1c2d7a9e01, 216236577a72
Create Date: 2026-10-30 19:00:00.000000

Joins the two heads cut from 0a4272c99a4b the same day, accounts (spec 0014, experiment
owner) and class folders, and gives a folder the same owner a notebook has (AC-6).
Additive only: existing folders keep a null owner, the access codes' shared space.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b3e9c51d2a4"
down_revision: str | Sequence[str] | None = ("4f1c2d7a9e01", "216236577a72")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("folder", sa.Column("owner_id", sa.Uuid(), nullable=True))
    op.create_index("ix_folder_owner_id", "folder", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_folder_owner_id", table_name="folder")
    op.drop_column("folder", "owner_id")
