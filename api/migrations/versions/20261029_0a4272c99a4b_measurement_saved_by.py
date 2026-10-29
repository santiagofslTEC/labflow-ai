"""measurement saved by

Revision ID: 0a4272c99a4b
Revises: ecc6502db325
Create Date: 2026-10-29 12:30:00.000000

Spec 0006, save without the card (AC-30): who saved each measurement, and whether LabFlow
saved a clean reading on its own. Additive only: existing rows read as saved by an unknown
holder with a tap.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0a4272c99a4b"
down_revision: str | Sequence[str] | None = "ecc6502db325"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("measurement", sa.Column("saved_by", sa.Text(), nullable=True))
    op.add_column(
        "measurement",
        sa.Column("auto_saved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("measurement", "auto_saved")
    op.drop_column("measurement", "saved_by")
