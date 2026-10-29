"""Units and conversions (spec 0006, AC-9). Pure, no database."""

import pytest

from app.services.units import UnknownUnit, canonical, normalize, split_unit


@pytest.mark.parametrize(
    ("said", "unit"),
    [
        ("grados", "°C"),
        ("grados centígrados", "°C"),
        ("grados celsius", "°C"),
        ("°C", "°C"),
        ("ºC", "°C"),
        ("C", "°C"),
        ("por ciento", "%"),
        ("porciento", "%"),
        ("%", "%"),
        ("minutos", "min"),
        ("min", "min"),
        ("horas", "h"),
        ("segundos", "s"),
        ("kelvin", "K"),
        ("grados fahrenheit", "°F"),
    ],
)
def test_canonical_synonyms(said: str, unit: str) -> None:
    assert canonical(said) == unit


@pytest.mark.parametrize(
    ("value", "said_unit", "variable_unit", "expected"),
    [
        (65.0, None, "°C", 65.0),
        (65.0, "°C", "°C", 65.0),
        (2.0, "h", "min", 120.0),
        (1200.0, "s", "min", 20.0),
        (338.15, "K", "°C", 65.0),
        (149.0, "°F", "°C", 65.0),
        (120.0, "min", "h", 2.0),
        (7.0, None, None, 7.0),
        (65.0, "°C", None, 65.0),  # a unitless variable takes a unit word as written
    ],
)
def test_normalize_converts(
    value: float, said_unit: str | None, variable_unit: str | None, expected: float
) -> None:
    assert normalize(value, said_unit, variable_unit) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("said_unit", "variable_unit"),
    [("%", "°C"), ("min", "°C"), ("pascales", "°C")],
)
def test_normalize_wrong_kind_is_unknown(said_unit: str, variable_unit: str | None) -> None:
    assert isinstance(normalize(65.0, said_unit, variable_unit), UnknownUnit)


@pytest.mark.parametrize(
    ("said", "expected"),
    [
        ("setenta y tres por ciento", ("setenta y tres", "%")),
        ("2 horas", ("2", "h")),
        ("74%", ("74", "%")),
        ("120s", ("120", "s")),
        ("setenta y tres", ("setenta y tres", None)),
        ("seis", ("seis", None)),
        ("65", ("65", None)),
    ],
)
def test_split_unit(said: str, expected: tuple[str, str | None]) -> None:
    assert split_unit(said) == expected
