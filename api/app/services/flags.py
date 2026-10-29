"""Light vs flagged values (spec 0006, AC-21 and AC-23). Pure.

Only `grounding` and `checked_at` are stored; every reason is worked out again from the
value, its said text, and the variable, so a changed range moves the flags with it.
"""

from collections.abc import Iterable, Mapping
from enum import StrEnum
from typing import Protocol

from app.models.enums import Grounding
from app.services.text import format_number
from app.services.units import canonical, split_unit


class FlagReason(StrEnum):
    OUT_OF_RANGE = "out_of_range"
    CONVERTED = "converted"
    CODE_MATCH = "code_match"


class VariableLike(Protocol):
    @property
    def name(self) -> str: ...
    @property
    def unit(self) -> str | None: ...
    @property
    def min_value(self) -> float | None: ...
    @property
    def max_value(self) -> float | None: ...


class ValueLike(Protocol):
    @property
    def variable_id(self) -> int: ...
    @property
    def value(self) -> float: ...
    @property
    def said_text(self) -> str | None: ...
    @property
    def grounding(self) -> Grounding | None: ...
    @property
    def checked(self) -> bool: ...


def _converted(said_text: str | None, variable: VariableLike) -> bool:
    if said_text is None:
        return False
    _, unit = split_unit(said_text, variable.unit)
    return unit is not None and variable.unit is not None and unit != canonical(variable.unit)


def flags(value: ValueLike, variable: VariableLike) -> tuple[FlagReason, ...]:
    """The reasons to look again at a value, in display order; empty means light."""
    low, high = variable.min_value, variable.max_value
    out_of_range = (low is not None and value.value < low) or (
        high is not None and value.value > high
    )
    reasons = (
        (FlagReason.OUT_OF_RANGE, out_of_range),
        (FlagReason.CONVERTED, _converted(value.said_text, variable)),
        (FlagReason.CODE_MATCH, value.grounding == Grounding.CODE),
    )
    return tuple(reason for reason, holds in reasons if holds)


def unchecked(
    values: Iterable[ValueLike], variables: Mapping[int, VariableLike], correction: bool
) -> tuple[int, ...]:
    """Variable ids of flagged values not yet checked. A correction is never flagged per
    value: choosing "Corregir" is already its extra step."""
    if correction:
        return ()
    return tuple(
        v.variable_id
        for v in values
        if v.variable_id in variables and not v.checked and flags(v, variables[v.variable_id])
    )


def interpreted(said_text: str | None, variable: VariableLike) -> bool:
    """True when LabFlow read something for the user: the number was in words, or the unit
    was converted. "74 por ciento" on a % variable is not interpreted."""
    if said_text is None:
        return False
    number, _ = split_unit(said_text, variable.unit)
    return not any(char.isdigit() for char in number) or _converted(said_text, variable)


def _with_unit(value: float, unit: str | None) -> str:
    return format_number(value) if unit is None else f"{format_number(value)} {unit}"


def flag_text(reason: FlagReason, value: ValueLike, variable: VariableLike) -> str:
    match reason:
        case FlagReason.OUT_OF_RANGE:
            low, high, unit = variable.min_value, variable.max_value, variable.unit
            if low is not None and high is not None:
                expected = f"{format_number(low)} a {_with_unit(high, unit)}"
            elif low is not None:
                expected = f"desde {_with_unit(low, unit)}"
            else:
                expected = f"hasta {_with_unit(high if high is not None else 0.0, unit)}"
            return f"Fuera del rango esperado: {expected}"
        case FlagReason.CONVERTED:
            return f"Convertí {value.said_text} a {_with_unit(value.value, variable.unit)}"
        case FlagReason.CODE_MATCH:
            return f"Revisa que este valor sea de {variable.name}"
