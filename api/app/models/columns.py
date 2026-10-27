"""Field builders for the column shapes every table repeats (spec 0002, Data model sketch).

They return `Any`, like SQLModel's own `Field`, so each attribute keeps its annotated type.
"""

# ruff: noqa: ANN401

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic_core import PydanticUndefined as Undefined
from sqlalchemy import BigInteger, Identity, Text, func
from sqlmodel import Field

FINITE = "NOT IN ('NaN', 'Infinity', '-Infinity')"


def utc_now() -> datetime:
    return datetime.now(UTC)


def id_field() -> Any:
    """`bigint generated always as identity primary key`."""
    return Field(
        default=None,
        primary_key=True,
        sa_type=BigInteger,
        sa_column_args=[Identity(always=True)],
    )


def fk_field(
    target: str,
    *,
    ondelete: Literal["CASCADE", "SET NULL"] | None = None,
    nullable: bool = False,
) -> Any:
    """A bigint foreign key; its index is declared in the table's `__table_args__`.

    `ondelete=None` keeps Postgres' default, NO ACTION.
    """
    return Field(
        default=None if nullable else ...,
        foreign_key=target,
        ondelete=Undefined if ondelete is None else ondelete,
        sa_type=BigInteger,
        nullable=nullable,
    )


def text_field(*, nullable: bool = False, server_default: str | None = None) -> Any:
    kwargs = {} if server_default is None else {"server_default": server_default}
    return Field(
        default=None if nullable else ...,
        sa_type=Text,
        nullable=nullable,
        sa_column_kwargs=kwargs,
    )


def enum_field(default: StrEnum) -> Any:
    """A `text` column holding an enum value, defaulted in Python and in the database."""
    return Field(default=default, sa_type=Text, sa_column_kwargs={"server_default": default.value})


def now_field() -> Any:
    """A `timestamptz` set in Python, with `now()` for manual inserts."""
    return Field(default_factory=utc_now, sa_column_kwargs={"server_default": func.now()})
