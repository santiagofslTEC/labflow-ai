"""Class folders on the lab dashboard (2026-10-30), and moving a notebook between them. Every
route sits behind the access session (the app wide gate)."""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.core.db import SessionDep
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep
from app.core.ownership import NOTEBOOK, OwnerDep
from app.repositories import folders
from app.services.results import (
    ExperimentDetail,
    ExperimentNotFound,
    FolderNotFound,
    FolderSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["folders"])

_ID_MAX = 2**63 - 1
NAME_MAX = 80

_UNAUTHORIZED = {"model": ApiErrorBody, "description": "No valid access session"}
_NO_FOLDER = {"model": ApiErrorBody, "description": "folder_not_found"}
_INVALID = {"model": ApiErrorBody, "description": "invalid_request"}


class FolderIn(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=NAME_MAX)


class FolderMove(BaseModel):
    """`folder_id` null takes the notebook out of its folder."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    folder_id: int | None = Field(ge=1)


def _folder_missing() -> ApiError:
    return ApiError(404, "folder_not_found", "Esa carpeta ya no existe.")


@router.get("/api/folders", responses={401: _UNAUTHORIZED})
def list_folders(session: SessionDep, owner: OwnerDep) -> list[FolderSummary]:
    """Only the caller's space (spec 0014, AC-6)."""
    return folders.list_folders(session, owner)


@router.post("/api/folders", status_code=201, responses={401: _UNAUTHORIZED, 422: _INVALID})
def create_folder(
    body: FolderIn, session: SessionDep, holder: HolderDep, owner: OwnerDep
) -> FolderSummary:
    created = folders.create_folder(session, holder, body.name, owner)
    logger.info("folder created", extra={"folder_id": created.id, "holder": holder})
    return created


@router.patch(
    "/api/folders/{folder_id}", responses={401: _UNAUTHORIZED, 404: _NO_FOLDER, 422: _INVALID}
)
def rename_folder(
    folder_id: int, body: FolderIn, session: SessionDep, owner: OwnerDep
) -> FolderSummary:
    if not 1 <= folder_id <= _ID_MAX:
        raise _folder_missing()
    result = folders.rename_folder(session, folder_id, body.name, owner)
    if isinstance(result, FolderNotFound):
        raise _folder_missing()
    return result


@router.delete(
    "/api/folders/{folder_id}",
    status_code=204,
    responses={401: _UNAUTHORIZED, 404: _NO_FOLDER, 422: _INVALID},
)
def delete_folder(folder_id: int, session: SessionDep, owner: OwnerDep) -> None:
    """Its notebooks stay, as "Sin carpeta"."""
    if not 1 <= folder_id <= _ID_MAX or isinstance(
        folders.delete_folder(session, folder_id, owner), FolderNotFound
    ):
        raise _folder_missing()


@router.put(
    "/api/experiments/{experiment_id}/folder",
    dependencies=[NOTEBOOK],
    responses={
        401: _UNAUTHORIZED,
        404: {"model": ApiErrorBody, "description": "No notebook with this id"},
        422: {"model": ApiErrorBody, "description": "invalid_request or folder_not_found"},
    },
)
def move_experiment(
    experiment_id: int, body: FolderMove, session: SessionDep, owner: OwnerDep
) -> ExperimentDetail:
    result = (
        folders.move_experiment(session, experiment_id, body.folder_id, owner)
        if 1 <= experiment_id <= _ID_MAX
        else ExperimentNotFound()
    )
    match result:
        case ExperimentDetail():
            return result
        case ExperimentNotFound():
            raise ApiError(404, result.code, "Este cuaderno no existe.")
        case FolderNotFound():
            raise ApiError(422, result.code, "Esa carpeta ya no existe.")
