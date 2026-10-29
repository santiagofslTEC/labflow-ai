"""Review a notebook's variables after it exists: add, edit, and delete (spec 0008). Every
route sits behind the access session (the app wide gate)."""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.core.db import SessionDep
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep
from app.repositories import variables
from app.services.experiment_rules import VARIABLES_MAX, VariableIn
from app.services.results import (
    DuplicateVariableName,
    ExperimentClosed,
    ExperimentNotFound,
    InvalidRange,
    LastVariable,
    UnitLocked,
    VariableDetail,
    VariableNotFound,
    VariablesDeleted,
    VariablesFull,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["variables"])

_ID_MAX = 2**63 - 1

_MESSAGES = {
    "experiment_not_found": "Este cuaderno no existe.",
    "variable_not_found": "Esa variable ya no existe en este cuaderno.",
    "experiment_closed": "Este cuaderno está cerrado; no se pueden cambiar sus variables.",
    "variables_full": f"Máximo {VARIABLES_MAX} variables.",
    "unit_locked": "No se puede cambiar la unidad: ya hay valores guardados en ella.",
    "last_variable": "Deja al menos una variable.",
}
_STATUS = {
    "experiment_not_found": 404,
    "variable_not_found": 404,
    "experiment_closed": 409,
    "variables_full": 409,
    "unit_locked": 409,
    "last_variable": 409,
}

type VariableError = (
    ExperimentNotFound
    | ExperimentClosed
    | VariablesFull
    | VariableNotFound
    | UnitLocked
    | LastVariable
    | DuplicateVariableName
    | InvalidRange
)


def _errors(*codes: int) -> dict[int | str, dict[str, object]]:
    described = {
        401: "No valid access session",
        404: "experiment_not_found or variable_not_found",
        409: "experiment_closed, variables_full, unit_locked, or last_variable",
        422: "invalid_request, duplicate_variable_name, or invalid_range",
    }
    return {code: {"model": ApiErrorBody, "description": described[code]} for code in codes}


def _fail(result: VariableError) -> ApiError:
    logger.warning("variables not changed", extra={"code": result.code})
    match result:
        case DuplicateVariableName():
            return ApiError(422, result.code, "Hay otra variable con este nombre.")
        case InvalidRange(name=name):
            return ApiError(
                422, result.code, f"En «{name}», el mínimo no puede ser mayor que el máximo."
            )
        case _:
            return ApiError(_STATUS[result.code], result.code, _MESSAGES[result.code])


class DeleteVariablesIn(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    variable_ids: tuple[int, ...] = Field(min_length=1, max_length=VARIABLES_MAX)


@router.post(
    "/api/experiments/{experiment_id}/variables",
    status_code=201,
    responses=_errors(401, 404, 409, 422),
)
def add_variable(
    experiment_id: int, body: VariableIn, session: SessionDep, holder: HolderDep
) -> VariableDetail:
    """A new variable, last in the notebook (AC-2)."""
    if not 1 <= experiment_id <= _ID_MAX:
        raise _fail(ExperimentNotFound())
    result = variables.add_variable(session, experiment_id, body)
    if not isinstance(result, VariableDetail):
        raise _fail(result)
    logger.info(
        "variable added",
        extra={"experiment_id": experiment_id, "variable_id": result.id, "holder": holder},
    )
    return result


@router.put("/api/variables/{variable_id}", responses=_errors(401, 404, 409, 422))
def update_variable(
    variable_id: int, body: VariableIn, session: SessionDep, holder: HolderDep
) -> VariableDetail:
    """A full replacement; the unit locks once a value is saved (AC-3)."""
    if not 1 <= variable_id <= _ID_MAX:
        raise _fail(VariableNotFound())
    result = variables.update_variable(session, variable_id, body)
    if not isinstance(result, VariableDetail):
        raise _fail(result)
    logger.info("variable updated", extra={"variable_id": variable_id, "holder": holder})
    return result


@router.post(
    "/api/experiments/{experiment_id}/variables/delete", responses=_errors(401, 404, 409, 422)
)
def delete_variables(
    experiment_id: int, body: DeleteVariablesIn, session: SessionDep, holder: HolderDep
) -> VariablesDeleted:
    """The variables, their saved values, and the trials left empty (AC-6)."""
    if len(set(body.variable_ids)) != len(body.variable_ids):
        raise ApiError(422, "invalid_request", "La solicitud no tiene el formato esperado.")
    if not 1 <= experiment_id <= _ID_MAX:
        raise _fail(ExperimentNotFound())
    result = variables.delete_variables(session, experiment_id, body.variable_ids)
    if not isinstance(result, VariablesDeleted):
        raise _fail(result)
    logger.info(
        "variables deleted",
        extra={
            "experiment_id": experiment_id,
            "variable_ids": list(body.variable_ids),
            "holder": holder,
            "measurements": result.measurements,
            "trials": result.trials,
        },
    )
    return result
