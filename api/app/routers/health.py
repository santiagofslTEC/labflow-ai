from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.settings import get_settings

router = APIRouter(prefix="/api/health", tags=["health"])


class Health(BaseModel):
    status: Literal["ok"]
    env: Literal["dev", "prod"]


@router.get("")
def read_health() -> Health:
    return Health(status="ok", env=get_settings().env)
