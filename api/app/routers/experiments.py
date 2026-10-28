"""Notebooks: list, create, and open (spec 0005). Users see "cuaderno"; the API says experiment."""

import logging

from fastapi import APIRouter

from app.core.db import SessionDep
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep
from app.repositories import experiments
from app.services.experiment_rules import NewExperiment, check_new_experiment
from app.services.results import (
    DuplicateVariableName,
    ExperimentDetail,
    ExperimentNotFound,
    ExperimentSummary,
    InvalidRange,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/experiments", tags=["experiments"])

# Ids are Postgres bigint identities; anything outside can never exist.
_ID_MAX = 2**63 - 1

_UNAUTHORIZED = {"model": ApiErrorBody, "description": "No valid access session"}


@router.get("", responses={401: _UNAUTHORIZED})
def list_experiments(session: SessionDep) -> list[ExperimentSummary]:
    return experiments.list_summaries(session)


@router.post(
    "",
    status_code=201,
    responses={
        401: _UNAUTHORIZED,
        422: {
            "model": ApiErrorBody,
            "description": "invalid_request, duplicate_variable_name, or invalid_range",
        },
    },
)
def create_experiment(
    body: NewExperiment, session: SessionDep, holder: HolderDep
) -> ExperimentDetail:
    checked = check_new_experiment(body)
    result = (
        checked if checked is not None else experiments.create_experiment(session, holder, body)
    )
    match result:
        case ExperimentDetail():
            logger.info(
                "experiment created",
                extra={
                    "experiment_id": result.id,
                    "holder": holder,
                    "variable_count": len(result.variables),
                },
            )
            return result
        case DuplicateVariableName(name=name):
            logger.warning("experiment not created", extra={"code": result.code})
            message = (
                f"Hay dos variables llamadas «{name}». Cambia una."
                if name is not None
                else "Hay dos variables con el mismo nombre."
            )
            raise ApiError(422, result.code, message)
        case InvalidRange(name=name):
            logger.warning("experiment not created", extra={"code": result.code})
            raise ApiError(
                422, result.code, f"En «{name}», el mínimo no puede ser mayor que el máximo."
            )


@router.get(
    "/{experiment_id}",
    responses={
        401: _UNAUTHORIZED,
        404: {"model": ApiErrorBody, "description": "No notebook with this id"},
        422: {"model": ApiErrorBody, "description": "The id is not an integer"},
    },
)
def read_experiment(experiment_id: int, session: SessionDep) -> ExperimentDetail:
    result = (
        experiments.get_experiment(session, experiment_id)
        if 1 <= experiment_id <= _ID_MAX
        else ExperimentNotFound()
    )
    if isinstance(result, ExperimentNotFound):
        raise ApiError(404, result.code, "Este cuaderno no existe.")
    return result
