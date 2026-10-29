from collections.abc import Mapping
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
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

    # AI (spec 0006). `fallback` tries Ollama first and starts Claude as a hedge.
    llm_provider: Literal["fallback", "ollama", "anthropic", "fake"] = "fallback"
    ollama_host: str = "https://ollama.com"
    ollama_api_key: str | None = None
    ollama_model: str = "deepseek-v4.1-flash"  # 50/50 on the live smoke test (spec 0006)
    ollama_hedge_s: float = Field(default=1.5, gt=0)
    llm_deadline_s: float = Field(default=4.5, gt=0)
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-haiku-5-5"
    claude_timeout_s: float = Field(default=3.0, gt=0)
    claude_max_calls_per_hour: int = Field(default=30, ge=0)
    # Reading experiment instructions (spec 0005, AC-33): a much longer call than capture.
    setup_hedge_s: float = Field(default=20, gt=0)
    setup_deadline_s: float = Field(default=45, gt=0)
    setup_claude_timeout_s: float = Field(default=25, gt=0)
    setup_max_tokens: int = Field(default=6000, gt=0)

    @model_validator(mode="after")
    def _check_ai_keys(self) -> "Settings":
        """In prod both keys are required and the scripted provider is refused (AC-15)."""
        if self.env == "prod":
            if self.llm_provider == "fake":
                raise ValueError("LLM_PROVIDER=fake is not allowed with ENV=prod")
            if not self.ollama_api_key or not self.anthropic_api_key:
                raise ValueError("ENV=prod needs OLLAMA_API_KEY and ANTHROPIC_API_KEY")
        if self.setup_hedge_s >= self.setup_deadline_s:
            raise ValueError("SETUP_HEDGE_S must be below SETUP_DEADLINE_S")
        return self

    @field_validator("access_codes", mode="before")
    @classmethod
    def _parse_access_codes(cls, value: object) -> Mapping[str, str]:
        if not isinstance(value, str):
            raise ValueError("ACCESS_CODES must be a string of name:code pairs")
        return parse_access_codes(value)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # required keys come from the env
