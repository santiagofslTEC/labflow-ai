"""Class folders on the lab dashboard (2026-10-30): list, create, rename, delete, and move a
notebook in or out of one. Every call is scoped to one owner's space (spec 0014, AC-6): a
folder outside it reads as missing."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Integer, func, type_coerce
from sqlalchemy import select as select_row
from sqlmodel import Session, col

from app.models import Experiment, Folder
from app.repositories.experiments import get_experiment
from app.repositories.space import folder_in_space, folder_visible
from app.services.results import (
    ExperimentDetail,
    ExperimentNotFound,
    FolderNotFound,
    FolderSummary,
)


def _utc(moment: datetime) -> datetime:
    return moment.astimezone(UTC)


def _owned(session: Session, folder_id: int, owner: UUID | None) -> Folder | None:
    folder = session.get(Folder, folder_id)
    return folder if folder is not None and folder.owner_id == owner else None


def list_folders(session: Session, owner: UUID | None = None) -> list[FolderSummary]:
    """The owner's folders by name, each with its notebook count."""
    counts = (
        select_row(col(Experiment.folder_id), func.count().label("notebook_count"))
        .where(col(Experiment.folder_id).is_not(None))
        .group_by(col(Experiment.folder_id))
        .subquery()
    )
    stmt = (
        select_row(
            col(Folder.id),
            col(Folder.name),
            func.coalesce(type_coerce(counts.c.notebook_count, Integer), 0),
            col(Folder.created_at),
        )
        .outerjoin(counts, counts.c.folder_id == col(Folder.id))
        .where(folder_in_space(owner))
        .order_by(func.lower(col(Folder.name)), col(Folder.id))
    )
    rows = session.connection().execute(stmt).all()
    return [
        FolderSummary(id=folder_id, name=name, notebook_count=count, created_at=_utc(created))
        for folder_id, name, count, created in rows
        if folder_id is not None  # an identity column is never null
    ]


def _summary(
    session: Session, folder_id: int, owner: UUID | None
) -> FolderSummary | FolderNotFound:
    found = next((f for f in list_folders(session, owner) if f.id == folder_id), None)
    return found if found is not None else FolderNotFound()


def create_folder(
    session: Session, holder: str, name: str, owner: UUID | None = None
) -> FolderSummary:
    folder = Folder(name=name, created_by=holder, owner_id=owner)
    session.add(folder)
    session.commit()
    session.refresh(folder)
    assert folder.id is not None  # set by the insert
    return FolderSummary(
        id=folder.id, name=folder.name, notebook_count=0, created_at=_utc(folder.created_at)
    )


def rename_folder(
    session: Session, folder_id: int, name: str, owner: UUID | None = None
) -> FolderSummary | FolderNotFound:
    folder = _owned(session, folder_id, owner)
    if folder is None:
        return FolderNotFound()
    folder.name = name
    session.add(folder)
    session.commit()
    return _summary(session, folder_id, owner)


def delete_folder(
    session: Session, folder_id: int, owner: UUID | None = None
) -> FolderNotFound | None:
    """Its notebooks stay, without a folder (the foreign key is ON DELETE SET NULL)."""
    folder = _owned(session, folder_id, owner)
    if folder is None:
        return FolderNotFound()
    session.delete(folder)
    session.commit()
    return None


def move_experiment(
    session: Session, experiment_id: int, folder_id: int | None, owner: UUID | None = None
) -> ExperimentDetail | ExperimentNotFound | FolderNotFound:
    """Put a notebook in one of the owner's folders, or take it out with `folder_id=None`."""
    experiment = session.get(Experiment, experiment_id)
    if experiment is None or experiment.owner_id != owner:
        return ExperimentNotFound()
    if folder_id is not None and not folder_visible(session, folder_id, owner):
        return FolderNotFound()
    experiment.folder_id = folder_id
    session.add(experiment)
    session.commit()
    return get_experiment(session, experiment_id)
