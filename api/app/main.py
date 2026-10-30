from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse

from app.ai.deps import make_clients
from app.core.db import get_engine
from app.core.errors import ApiError, handle_api_error, handle_validation_error
from app.core.gate import AttemptLog, require_access
from app.core.instruction_reads import InstructionReads
from app.core.settings import get_settings
from app.routers import access, capture, experiments, health, variables, voice
from app.voice.sessions import VoiceSessions


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    # Fail fast on a missing env key instead of on the first request.
    get_settings()
    attempts: AttemptLog = {}
    app.state.access_attempts = attempts
    app.state.llm_clients = make_clients(get_settings())
    app.state.instruction_reads = InstructionReads()
    app.state.voice_sessions = VoiceSessions()
    yield
    get_engine().dispose()


# require_access guards every route except OPEN_PATHS (health, access, the voice Custom LLM).
# FastAPI's built in docs skip app dependencies, so they are off here and
# registered below as ordinary routes, which puts them behind the gate too.
app = FastAPI(
    title="LabFlow AI API",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(require_access)],
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
)

app.add_exception_handler(ApiError, handle_api_error)
app.add_exception_handler(RequestValidationError, handle_validation_error)


@app.get("/openapi.json", include_in_schema=False)
def openapi_schema() -> dict[str, object]:
    return app.openapi()


@app.get("/docs", include_in_schema=False)
def swagger_docs() -> HTMLResponse:
    return get_swagger_ui_html(openapi_url="/openapi.json", title=f"{app.title} docs")


@app.get("/redoc", include_in_schema=False)
def redoc_docs() -> HTMLResponse:
    return get_redoc_html(openapi_url="/openapi.json", title=f"{app.title} docs")


app.include_router(health.router)
app.include_router(access.router)
app.include_router(experiments.router)
app.include_router(capture.router)
app.include_router(voice.router)
app.include_router(variables.router)
