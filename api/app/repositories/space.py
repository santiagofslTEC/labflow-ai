"""Which notebooks a principal sees (spec 0014, AC-6): its own as an account (its user id),
or the access codes' shared space (a null owner)."""

from uuid import UUID

from sqlalchemy import ColumnElement, text
from sqlmodel import Session, col, select

from app.models import Experiment, Folder

_ID_MAX = 2**63 - 1


def in_space(owner: UUID | None) -> ColumnElement[bool]:
    """The notebooks a principal with this owner id sees."""
    owner_id = col(Experiment.owner_id)
    return owner_id == owner if owner is not None else owner_id.is_(None)


def folder_in_space(owner: UUID | None) -> ColumnElement[bool]:
    """The class folders a principal with this owner id sees (same rule as notebooks)."""
    owner_id = col(Folder.owner_id)
    return owner_id == owner if owner is not None else owner_id.is_(None)


def folder_visible(session: Session, folder_id: int, owner: UUID | None) -> bool:
    if not 1 <= folder_id <= _ID_MAX:
        return False
    found = session.exec(
        select(col(Folder.id)).where(col(Folder.id) == folder_id, folder_in_space(owner))
    ).first()
    return found is not None


def notebook_visible(session: Session, experiment_id: int, owner: UUID | None) -> bool:
    if not 1 <= experiment_id <= _ID_MAX:
        return False
    found = session.exec(
        select(col(Experiment.id)).where(col(Experiment.id) == experiment_id, in_space(owner))
    ).first()
    return found is not None


def assign_shared(session: Session, owner: UUID, *, dry_run: bool) -> int:
    """Give every notebook in the codes' shared space to one account (spec 0014, AC-9), in
    one transaction, with the shared class folders so each notebook keeps its folder; with
    `dry_run` only count them. Returns how many notebooks."""
    shared = session.exec(select(Experiment).where(col(Experiment.owner_id).is_(None))).all()
    if not dry_run:
        for experiment in shared:
            experiment.owner_id = owner
            session.add(experiment)
        for folder in session.exec(select(Folder).where(col(Folder.owner_id).is_(None))).all():
            folder.owner_id = owner
            session.add(folder)
        session.commit()
    return len(shared)


def account_by_email(session: Session, email: str) -> UUID | None:
    """The Supabase account with this email, read from Supabase's auth schema. Only the
    assign script calls it; the API never reads that schema."""
    row = (
        session.connection()
        .execute(
            text("select id from auth.users where lower(email) = lower(:email)"), {"email": email}
        )
        .first()
    )
    return UUID(str(row[0])) if row is not None else None
