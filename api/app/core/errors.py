"""The one API error shape: {"code": "<snake_case>", "message": "<Spanish, shown to the user>"}."""

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict


class ApiErrorBody(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str
    message: str


class ApiError(Exception):
    """Raised only at the edge (routers and their dependencies); the handler turns it into
    an ApiErrorBody with the given status."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.body = ApiErrorBody(code=code, message=message)


def error_response(status_code: int, body: ApiErrorBody) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=body.model_dump())


async def handle_api_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(exc.status_code, exc.body)


async def handle_validation_error(_request: Request, _exc: Exception) -> JSONResponse:
    return error_response(
        422,
        ApiErrorBody(code="invalid_request", message="La solicitud no tiene el formato esperado."),
    )
