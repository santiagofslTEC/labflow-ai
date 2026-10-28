from collections.abc import Mapping
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.core.access import parse_access_codes


class Settings(BaseSettings):
    """Env driven config. Each feature adds the keys it needs (see api/.env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    # Required, never defaulted: `make seed` and the cookie `Secure` flag trust it.
    env: Literal["dev", "prod"]
    log_level: str = "INFO"
    # Supavisor session pooler, port 5432: postgresql+psycopg://…?sslmode=require (spec 0001)
    database_url: str
    # `name:code` pairs, comma separated; parsed to holder name → code (access gate, spec 0001).
    access_codes: Annotated[Mapping[str, str], NoDecode]
    # Signs the labflow_session cookie. Long and random: `openssl rand -hex 32`.
    session_secret: str = Field(min_length=32)

    @field_validator("access_codes", mode="before")
    @classmethod
    def _parse_access_codes(cls, value: object) -> Mapping[str, str]:
        if not isinstance(value, str):
            raise ValueError("ACCESS_CODES must be a string of name:code pairs")
        return parse_access_codes(value)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # required keys come from the env
