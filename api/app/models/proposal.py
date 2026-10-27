from datetime import datetime

from sqlalchemy import CheckConstraint, Index, text
from sqlmodel import SQLModel

from app.models.columns import enum_field, fk_field, id_field, now_field
from app.models.enums import ProposalStatus, check_in


class Proposal(SQLModel, table=True):
    """What LabFlow understood, waiting on the card until you confirm or discard it."""

    __table_args__ = (
        CheckConstraint(check_in("status", ProposalStatus), name="status"),
        CheckConstraint("trial_number > 0", name="trial_number"),
        CheckConstraint("(status = 'pending') = (resolved_at IS NULL)", name="resolved"),
        # At most one pending card per experiment (the backstop; start_proposal locks first).
        Index(
            "uq_proposal_experiment_pending",
            "experiment_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        # Also serves as the experiment_id index.
        Index("ix_proposal_experiment_id_id", "experiment_id", "id"),
        Index("ix_proposal_target_trial_id", "target_trial_id"),
        Index("ix_proposal_confirmed_trial_id", "confirmed_trial_id"),
    )

    id: int | None = id_field()
    experiment_id: int = fk_field("experiment.id", ondelete="CASCADE")
    status: ProposalStatus = enum_field(ProposalStatus.PENDING)
    trial_number: int | None = None  # null until dictated
    # Set means "correct this trial" (RN-02).
    target_trial_id: int | None = fk_field("trial.id", ondelete="SET NULL", nullable=True)
    # The trial that confirm wrote.
    confirmed_trial_id: int | None = fk_field("trial.id", ondelete="SET NULL", nullable=True)
    created_at: datetime = now_field()
    updated_at: datetime = now_field()  # changes on every value or trial change
    resolved_at: datetime | None = None
