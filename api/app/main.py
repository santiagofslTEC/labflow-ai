from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError

from app.core.db import get_engine
from app.core.errors import ApiError, handle_api_error, handle_validation_error
from app.core.gate import AttemptLog, require_access
from app.core.settings import get_settings
from app.routers import access, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    # Fail fast on a missing env key instead of on the first request.
    get_settings()
    attempts: AttemptLog = {}
    app.state.access_attempts = attempts
    yield
    get_engine().dispose()


# require_access guards every route; only /api/health and /api/access stay open.
app = FastAPI(
    title="LabFlow AI API",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(require_access)],
)

app.add_exception_handler(ApiError, handle_api_error)
app.add_exception_handler(RequestValidationError, handle_validation_error)

app.include_router(health.router)
app.include_router(access.router)
