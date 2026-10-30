"""experiment owner

Revision ID: 4f1c2d7a9e01
Revises: 0a4272c99a4b
Create Date: 2026-10-30 14:00:00.000000

Spec 0014, accounts (AC-6): the Supabase account that owns a notebook. Additive only:
existing notebooks keep a null owner, which is the access codes' shared space.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4f1c2d7a9e01"
down_revision: str | Sequence[str] | None = "0a4272c99a4b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("experiment", sa.Column("owner_id", sa.Uuid(), nullable=True))
    op.create_index("ix_experiment_owner_id_id", "experiment", ["owner_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_experiment_owner_id_id", table_name="experiment")
    op.drop_column("experiment", "owner_id")
