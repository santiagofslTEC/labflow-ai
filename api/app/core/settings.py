from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Env driven config. Each feature adds the keys it needs (see api/.env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Required, never defaulted: `make seed` and the cookie `Secure` flag trust it.
    env: Literal["dev", "prod"]
    log_level: str = "INFO"
    # Supavisor session pooler, port 5432: postgresql+psycopg://…?sslmode=require (spec 0001)
    database_url: str


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # required keys come from the env
