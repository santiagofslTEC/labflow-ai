"""The shape and rules of a new notebook (spec 0005, AC-15). Pure: no I/O.

The limits below are mirrored by `validateExperimentForm` in `web/src/lib/experiment-form.ts`;
a test on each side pins the same numbers, so a change must touch both.
"""

from collections.abc import Iterable, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.services.results import (
    DuplicateVariableName,
    InvalidRange,
    NameInUse,
    NewExperimentError,
)

TITLE_MAX = 200
GOAL_MAX = 1000
CONTEXT_MAX = 600
NAME_MAX = 80
UNIT_MAX = 20
VARIABLES_MAX = 12
ALIASES_MAX = 8
ALIAS_MAX = 40


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


class VariableIn(NewVariable):
    """One variable added or edited after the notebook exists (spec 0008, AC-2 to AC-4): the
    create fields plus `aliases`, the other names the capture prompt lists."""

    aliases: tuple[str, ...] = ()

    @field_validator("aliases")
    @classmethod
    def _clean_aliases(cls, value: tuple[str, ...], info: ValidationInfo) -> tuple[str, ...]:
        # The variable's own name is dropped like a repeat (AC-10); `name` is validated first.
        own = str(info.data.get("name", "")).lower()
        kept = tuple(
            dict.fromkeys(a.strip() for a in value if a.strip() and a.strip().lower() != own)
        )
        if len({a.lower() for a in kept}) != len(kept):
            raise ValueError("aliases must be unique ignoring case")
        if len(kept) > ALIASES_MAX or any(len(a) > ALIAS_MAX for a in kept):
            raise ValueError(f"at most {ALIASES_MAX} aliases of {ALIAS_MAX} characters")
        return kept


def check_variable(
    body: VariableIn, others: Iterable[tuple[str, Sequence[str]]]
) -> DuplicateVariableName | NameInUse | InvalidRange | None:
    """A variable's own rules against the notebook's other variables, each as (name, other
    names): names and other names are one set, ignoring case (spec 0008, AC-4, AC-10)."""
    others = tuple(others)
    names = {name.lower(): name for name, _ in others}
    aliases = {alias.lower(): name for name, owned in others for alias in owned}
    if body.name.lower() in names:
        return DuplicateVariableName(name=body.name)
    if (owner := aliases.get(body.name.lower())) is not None:
        return NameInUse(word=body.name, owner=owner)
    for alias in body.aliases:
        if alias.lower() in names:
            return NameInUse(word=alias, owner=None)
        if (owner := aliases.get(alias.lower())) is not None:
            return NameInUse(word=alias, owner=owner)
    low, high = body.min_value, body.max_value
    if low is not None and high is not None and low > high:
        return InvalidRange(name=body.name)
    return None


class NewExperiment(BaseModel):
    # extra="forbid": a `created_by` in the body is refused; it comes only from the session.
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=TITLE_MAX)
    goal: str | None = Field(default=None, max_length=GOAL_MAX)
    context: str | None = Field(default=None, max_length=CONTEXT_MAX)  # for the capture prompt
    variables: tuple[NewVariable, ...] = Field(min_length=1, max_length=VARIABLES_MAX)
    folder_id: int | None = Field(default=None, ge=1)  # its class folder, if any

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
