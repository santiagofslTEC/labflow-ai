from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.db import get_engine
from app.core.settings import get_settings
from app.routers import health


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    # Fail fast on a missing env key instead of on the first request.
    get_settings()
    yield
    get_engine().dispose()


app = FastAPI(title="LabFlow AI API", version="0.1.0", lifespan=lifespan)

app.include_router(health.router)
