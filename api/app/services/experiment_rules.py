"""The shape and rules of a new notebook (spec 0005, AC-15). Pure: no I/O.

The limits below are mirrored by `validateExperimentForm` in `web/src/lib/experiment-form.ts`;
a test on each side pins the same numbers, so a change must touch both.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.results import DuplicateVariableName, InvalidRange, NewExperimentError

TITLE_MAX = 200
GOAL_MAX = 1000
CONTEXT_MAX = 600
NAME_MAX = 80
UNIT_MAX = 20
VARIABLES_MAX = 12


def _blank_to_none(value: str | None) -> str | None:
    return value or None


class NewVariable(BaseModel):
    # Strings are stripped before their length is checked, so "   " fails min_length.
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=NAME_MAX)
    unit: str | None = Field(default=None, max_length=UNIT_MAX)
    min_value: float | None = Field(default=None, allow_inf_nan=False)
    max_value: float | None = Field(default=None, allow_inf_nan=False)
    required: bool = True

    _unit = field_validator("unit")(_blank_to_none)


class NewExperiment(BaseModel):
    # extra="forbid": a `created_by` in the body is refused; it comes only from the session.
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=TITLE_MAX)
    goal: str | None = Field(default=None, max_length=GOAL_MAX)
    context: str | None = Field(default=None, max_length=CONTEXT_MAX)  # for the capture prompt
    variables: tuple[NewVariable, ...] = Field(min_length=1, max_length=VARIABLES_MAX)

    _optional_text = field_validator("goal", "context")(_blank_to_none)


def check_new_experiment(body: NewExperiment) -> NewExperimentError | None:
    """The rules Pydantic cannot express on one field: names unique ignoring case (the DB index
    on `lower(name)` is the backstop), and min not above max (the DB CHECK is the backstop)."""
    seen: set[str] = set()
    for variable in body.variables:
        key = variable.name.lower()
        if key in seen:
            return DuplicateVariableName(name=variable.name)
        seen.add(key)
    for variable in body.variables:
        low, high = variable.min_value, variable.max_value
        if low is not None and high is not None and low > high:
            return InvalidRange(name=variable.name)
    return None
