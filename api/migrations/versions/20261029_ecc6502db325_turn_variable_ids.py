"""turn variable ids

Revision ID: ecc6502db325
Revises: e68b3b64c4ba
Create Date: 2026-10-29 12:00:00.000000

Spec 0006, short answers: `turn.variable_ids` keeps the variables an assistant reply named,
so a "sí" to "¿Es Temperatura?" can accept that one variable. Additive only, nullable, so the
running API keeps working before it is redeployed.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "ecc6502db325"
down_revision: str | Sequence[str] | None = "e68b3b64c4ba"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "turn", sa.Column("variable_ids", postgresql.ARRAY(sa.BigInteger()), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("turn", "variable_ids")
