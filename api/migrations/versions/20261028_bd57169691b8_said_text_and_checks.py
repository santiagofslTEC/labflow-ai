"""said text and checks

Revision ID: bd57169691b8
Revises: 8bab157c1289
Create Date: 2026-10-28 15:55:22.367764

Spec 0006 amendment: the user's own words per value, how grounding matched them, and when a
flagged value was checked. All columns are nullable with no backfill, so old rows read as
"Escrito a mano" and unchecked. The `grounding` CHECK is added by hand (autogenerate skips it).
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bd57169691b8"
down_revision: str | Sequence[str] | None = "8bab157c1289"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("measurement", sa.Column("said_text", sa.Text(), nullable=True))
    op.add_column("proposal_value", sa.Column("said_text", sa.Text(), nullable=True))
    op.add_column("proposal_value", sa.Column("grounding", sa.Text(), nullable=True))
    op.add_column(
        "proposal_value",
        sa.Column("checked_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_proposal_value_grounding"),
        "proposal_value",
        "grounding IN ('model', 'code')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_proposal_value_grounding"), "proposal_value", type_="check")
    op.drop_column("proposal_value", "checked_at")
    op.drop_column("proposal_value", "grounding")
    op.drop_column("proposal_value", "said_text")
    op.drop_column("measurement", "said_text")
