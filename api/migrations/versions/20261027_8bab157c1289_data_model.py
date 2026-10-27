"""data model

Revision ID: 8bab157c1289
Revises:
Create Date: 2026-10-27 14:07:56.538330

The seven tables of spec 0002. Drafted by autogenerate, then edited by hand: the
`lower(name)` and partial unique indexes are checked against the spec, and RLS plus the
revokes from the Supabase API roles are added at the end of `upgrade`.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "8bab157c1289"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Parents before children; downgrade drops them in reverse.
TABLES = ("experiment", "trial", "turn", "variable", "proposal", "measurement", "proposal_value")


def upgrade() -> None:
    op.create_table(
        "experiment",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="open", nullable=False),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("status IN ('open', 'closed')", name=op.f("ck_experiment_status")),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 200", name=op.f("ck_experiment_title_length")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_experiment")),
    )
    op.create_table(
        "trial",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("experiment_id", sa.BigInteger(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("number > 0", name=op.f("ck_trial_number")),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiment.id"],
            name=op.f("fk_trial_experiment_id"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trial")),
    )
    op.create_index("uq_trial_experiment_number", "trial", ["experiment_id", "number"], unique=True)
    op.create_table(
        "turn",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("experiment_id", sa.BigInteger(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("tool_name", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(role = 'user') = (source IS NOT NULL)", name=op.f("ck_turn_user_source")
        ),
        sa.CheckConstraint("role IN ('user', 'assistant')", name=op.f("ck_turn_role")),
        sa.CheckConstraint("source IN ('voice', 'text')", name=op.f("ck_turn_source")),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiment.id"],
            name=op.f("fk_turn_experiment_id"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_turn")),
    )
    op.create_index(
        "ix_turn_experiment_id_id",
        "turn",
        ["experiment_id", sa.literal_column("id DESC")],
        unique=False,
    )
    op.create_table(
        "variable",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("experiment_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=True),
        sa.Column("min_value", sa.Double(), nullable=True),
        sa.Column("max_value", sa.Double(), nullable=True),
        sa.Column("required", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("aliases", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column(
            "created_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80", name=op.f("ck_variable_name_length")
        ),
        sa.CheckConstraint(
            "min_value IS NULL OR max_value IS NULL OR min_value <= max_value",
            name=op.f("ck_variable_range"),
        ),
        sa.CheckConstraint("position >= 0", name=op.f("ck_variable_position")),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiment.id"],
            name=op.f("fk_variable_experiment_id"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_variable")),
    )
    op.create_index(
        "uq_variable_experiment_name",
        "variable",
        ["experiment_id", sa.literal_column("lower(name)")],
        unique=True,
    )
    op.create_table(
        "proposal",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("experiment_id", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("trial_number", sa.Integer(), nullable=True),
        sa.Column("target_trial_id", sa.BigInteger(), nullable=True),
        sa.Column("confirmed_trial_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
        sa.CheckConstraint(
            "(status = 'pending') = (resolved_at IS NULL)", name=op.f("ck_proposal_resolved")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'discarded', 'superseded')",
            name=op.f("ck_proposal_status"),
        ),
        sa.CheckConstraint("trial_number > 0", name=op.f("ck_proposal_trial_number")),
        sa.ForeignKeyConstraint(
            ["confirmed_trial_id"],
            ["trial.id"],
            name=op.f("fk_proposal_confirmed_trial_id"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiment.id"],
            name=op.f("fk_proposal_experiment_id"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_trial_id"],
            ["trial.id"],
            name=op.f("fk_proposal_target_trial_id"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal")),
    )
    op.create_index(
        "ix_proposal_confirmed_trial_id", "proposal", ["confirmed_trial_id"], unique=False
    )
    op.create_index(
        "ix_proposal_experiment_id_id", "proposal", ["experiment_id", "id"], unique=False
    )
    op.create_index("ix_proposal_target_trial_id", "proposal", ["target_trial_id"], unique=False)
    op.create_index(
        "uq_proposal_experiment_pending",
        "proposal",
        ["experiment_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_table(
        "measurement",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("trial_id", sa.BigInteger(), nullable=False),
        sa.Column("variable_id", sa.BigInteger(), nullable=False),
        sa.Column("value", sa.Double(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=True),
        sa.Column("original_phrase", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("said_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
        sa.Column("turn_id", sa.BigInteger(), nullable=True),
        sa.Column("proposal_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "confirmed_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("edited_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
        sa.CheckConstraint("source IN ('voice', 'text')", name=op.f("ck_measurement_source")),
        sa.CheckConstraint(
            "value NOT IN ('NaN', 'Infinity', '-Infinity')",
            name=op.f("ck_measurement_value_finite"),
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["proposal.id"],
            name=op.f("fk_measurement_proposal_id"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["trial_id"], ["trial.id"], name=op.f("fk_measurement_trial_id"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["turn_id"], ["turn.id"], name=op.f("fk_measurement_turn_id"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["variable_id"], ["variable.id"], name=op.f("fk_measurement_variable_id")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_measurement")),
    )
    op.create_index("ix_measurement_proposal_id", "measurement", ["proposal_id"], unique=False)
    op.create_index("ix_measurement_turn_id", "measurement", ["turn_id"], unique=False)
    op.create_index("ix_measurement_variable_id", "measurement", ["variable_id"], unique=False)
    op.create_index(
        "uq_measurement_trial_variable", "measurement", ["trial_id", "variable_id"], unique=True
    )
    op.create_table(
        "proposal_value",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("proposal_id", sa.BigInteger(), nullable=False),
        sa.Column("variable_id", sa.BigInteger(), nullable=False),
        sa.Column("value", sa.Double(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=True),
        sa.Column("original_phrase", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("said_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
        sa.Column("turn_id", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("source IN ('voice', 'text')", name=op.f("ck_proposal_value_source")),
        sa.CheckConstraint(
            "value NOT IN ('NaN', 'Infinity', '-Infinity')",
            name=op.f("ck_proposal_value_value_finite"),
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["proposal.id"],
            name=op.f("fk_proposal_value_proposal_id"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["turn_id"], ["turn.id"], name=op.f("fk_proposal_value_turn_id"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["variable_id"],
            ["variable.id"],
            name=op.f("fk_proposal_value_variable_id"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_value")),
    )
    op.create_index("ix_proposal_value_turn_id", "proposal_value", ["turn_id"], unique=False)
    op.create_index(
        "ix_proposal_value_variable_id", "proposal_value", ["variable_id"], unique=False
    )
    op.create_index(
        "uq_proposal_value_proposal_variable",
        "proposal_value",
        ["proposal_id", "variable_id"],
        unique=True,
    )

    # The API connects as `postgres`, which bypasses RLS. RLS with no policies plus the
    # revokes means the Supabase Data API (anon, authenticated) sees nothing (AC-12).
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON {table} FROM anon, authenticated")
    # Alembic's own bookkeeping table sits in `public` too; keep it off the Data API.
    op.execute("ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON alembic_version FROM anon, authenticated")


def downgrade() -> None:
    # Dropping a table drops its indexes, constraints, and RLS with it.
    for table in reversed(TABLES):
        op.drop_table(table)
