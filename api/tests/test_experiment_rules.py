"""The pure rules of a new notebook (spec 0005, AC-5, AC-15)."""

import pytest
from pydantic import ValidationError

from app.services import experiment_rules
from app.services.experiment_rules import NewExperiment, NewVariable, check_new_experiment
from app.services.results import DuplicateVariableName, InvalidRange


def body(*variables: NewVariable) -> NewExperiment:
    return NewExperiment(title="T", variables=variables)


def test_limits_match_the_web_form() -> None:
    # Mirrored by LIMITS in web/src/lib/experiment-form.ts; change both together.
    assert experiment_rules.TITLE_MAX == 200
    assert experiment_rules.GOAL_MAX == 1000
    assert experiment_rules.NAME_MAX == 80
    assert experiment_rules.UNIT_MAX == 20
    assert experiment_rules.VARIABLES_MAX == 12


def test_strips_strings_and_turns_blanks_into_none() -> None:
    parsed = NewExperiment(
        title="  Rendimiento  ",
        goal="   ",
        variables=(NewVariable(name=" Temperatura ", unit="  "),),
    )
    assert parsed.title == "Rendimiento"
    assert parsed.goal is None
    assert parsed.variables[0].name == "Temperatura"
    assert parsed.variables[0].unit is None
    assert parsed.variables[0].required is True


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_rejects_a_bad_title(title: str) -> None:
    with pytest.raises(ValidationError):
        NewExperiment(title=title, variables=(NewVariable(name="A"),))


def test_rejects_zero_or_thirteen_variables() -> None:
    with pytest.raises(ValidationError):
        body()
    with pytest.raises(ValidationError):
        body(*(NewVariable(name=f"V{i}") for i in range(13)))


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_rejects_a_non_finite_range(value: float) -> None:
    with pytest.raises(ValidationError):
        NewVariable(name="A", min_value=value)


def test_rejects_created_by_in_the_body() -> None:
    with pytest.raises(ValidationError):
        NewExperiment.model_validate(
            {"title": "T", "variables": [{"name": "A"}], "created_by": "someone"}
        )


def test_accepts_a_valid_notebook() -> None:
    assert check_new_experiment(body(NewVariable(name="A", min_value=1, max_value=1))) is None


def test_finds_a_duplicate_name_ignoring_case_and_spaces() -> None:
    result = check_new_experiment(
        body(NewVariable(name="Temperatura"), NewVariable(name=" temperatura "))
    )
    assert result == DuplicateVariableName(name="temperatura")


def test_finds_a_min_above_max() -> None:
    result = check_new_experiment(
        body(NewVariable(name="A"), NewVariable(name="Temp", min_value=90, max_value=80))
    )
    assert result == InvalidRange(name="Temp")
